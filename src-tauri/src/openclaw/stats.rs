/// openclaw/stats.rs
/// 从数据库日志解析消息统计与增长趋势
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::database::pool::DbPool;
use crate::error::Result;

/// OPC 统计信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpcStats {
    /// 今日消息总数
    pub today_messages: i64,
    /// 昨日消息总数
    pub yesterday_messages: i64,
    /// 消息增长率（百分比，可为负）
    pub message_growth_pct: f64,
    /// 各 Agent 今日消息数
    pub agent_stats: Vec<AgentMsgStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMsgStat {
    pub agent_id: Option<String>,
    pub agent_name: String,
    pub message_count: i64,
}

/// 计算 OPC 的消息统计
pub fn get_opc_stats(pool: &DbPool, opc_id: &str) -> Result<OpcStats> {
    let conn = pool.get()?;

    let today_start = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| crate::error::AppError::Internal("invalid midnight timestamp".to_string()))?
        .and_utc()
        .timestamp();
    let yesterday_start = today_start - 86_400;

    // 今日消息数（来自 log 表，opc 相关组件）
    let today_messages: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM log_entries
             WHERE timestamp >= ?1 AND (component LIKE '%opc%' OR component = ?2)",
            rusqlite::params![today_start, opc_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 昨日消息数
    let yesterday_messages: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM log_entries
             WHERE timestamp >= ?1 AND timestamp < ?2
               AND (component LIKE '%opc%' OR component = ?3)",
            rusqlite::params![yesterday_start, today_start, opc_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let message_growth_pct = if yesterday_messages > 0 {
        ((today_messages - yesterday_messages) as f64 / yesterday_messages as f64) * 100.0
    } else if today_messages > 0 {
        100.0
    } else {
        0.0
    };

    // 各 Agent 消息数（按 agent_id 分组）
    let mut stmt = conn.prepare(
        "SELECT agent_id, COUNT(*) as cnt
         FROM log_entries
         WHERE timestamp >= ?1 AND agent_id IS NOT NULL
         GROUP BY agent_id
         ORDER BY cnt DESC
         LIMIT 10",
    )?;
    let agent_stats: Vec<AgentMsgStat> = stmt
        .query_map(rusqlite::params![today_start], |row| {
            Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?))
        })?
        .filter_map(|r| r.ok())
        .map(|(agent_id, count)| AgentMsgStat {
            agent_name: agent_id.clone().unwrap_or_default(),
            agent_id,
            message_count: count,
        })
        .collect();

    Ok(OpcStats {
        today_messages,
        yesterday_messages,
        message_growth_pct,
        agent_stats,
    })
}

/// 获取最近 N 天的每日消息量（趋势数据）
///
/// 使用单次 SQL 查询替代 N 次循环查询，性能更优。
pub fn get_daily_message_trend(pool: &DbPool, days: u32) -> Result<Vec<DailyStats>> {
    let conn = pool.get()?;

    let today_start = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| crate::error::AppError::Internal("invalid midnight timestamp".to_string()))?
        .and_utc()
        .timestamp();
    let range_start = today_start - (days as i64 - 1) * 86_400;
    let range_end = today_start + 86_400;

    // 单次查询：将 timestamp 按天取整后 GROUP BY，获取每天计数
    let mut stmt = conn.prepare(
        "SELECT (timestamp / 86400) * 86400 AS day_ts, COUNT(*) AS cnt
         FROM log_entries
         WHERE timestamp >= ?1 AND timestamp < ?2
         GROUP BY day_ts
         ORDER BY day_ts ASC",
    )?;
    let counts: std::collections::HashMap<i64, i64> = stmt
        .query_map(rusqlite::params![range_start, range_end], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // 生成完整的日期序列，缺失日期填 0
    let result: Vec<DailyStats> = (0..days)
        .rev()
        .map(|i| {
            let day_start = today_start - i as i64 * 86_400;
            // SQLite 整除结果取决于本地时间戳对齐，直接用 day_start 匹配
            let count = counts.get(&day_start).copied().unwrap_or(0);
            DailyStats {
                day_offset: i as i32,
                timestamp: day_start,
                message_count: count,
            }
        })
        .collect();

    Ok(result)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    /// 距今天的天数（0 = 今天，1 = 昨天...）
    pub day_offset: i32,
    /// 当天零点 Unix 时间戳
    pub timestamp: i64,
    pub message_count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    #[test]
    fn test_stats_empty_db() {
        let pool = setup();
        let stats = get_opc_stats(&pool, "test_opc").unwrap();
        assert_eq!(stats.today_messages, 0);
        assert_eq!(stats.message_growth_pct, 0.0);
        assert!(stats.agent_stats.is_empty());
    }

    #[test]
    fn test_daily_trend_empty() {
        let pool = setup();
        let trend = get_daily_message_trend(&pool, 7).unwrap();
        assert_eq!(trend.len(), 7);
        assert!(trend.iter().all(|d| d.message_count == 0));
    }

    /// Insert the parent rows required by the log_entries FK constraints.
    ///
    /// log_entries.agent_id → agents(id), and agents.opc_id → opc_config(id).
    /// We insert one opc_config row and two agent rows so that tests that set
    /// agent_id can satisfy the foreign key constraint.
    fn insert_fixtures(conn: &rusqlite::Connection) {
        use rusqlite::params;
        let now = Utc::now().timestamp();
        conn.execute(
            "INSERT INTO opc_config (id, name, display_name, created_at, updated_at)
             VALUES ('opc_test', 'opc', 'Test OPC', ?1, ?1)",
            params![now],
        )
        .unwrap();
        for agent in &["agent_a", "agent_b"] {
            conn.execute(
                "INSERT INTO agents (id, opc_id, name, display_name, created_at, updated_at)
                 VALUES (?1, 'opc_test', ?1, ?1, ?2, ?2)",
                params![agent, now],
            )
            .unwrap();
        }
    }

    #[test]
    fn test_stats_with_data() {
        use rusqlite::params;

        let pool = setup();
        let conn = pool.get().unwrap();

        insert_fixtures(&conn);

        let today_start = Utc::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let yesterday_start = today_start - 86_400;
        // 今日某時刻 = 今日零点 + 3600
        let today_ts = today_start + 3600;
        // 昨日某時刻 = 昨日零点 + 3600
        let yesterday_ts = yesterday_start + 3600;

        // 今日2条（agent_id = "agent_a" 和 "agent_b"）
        conn.execute(
            "INSERT INTO log_entries (timestamp, level, component, message, agent_id) VALUES (?1, 'INFO', 'opc', 'msg1', 'agent_a')",
            params![today_ts],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO log_entries (timestamp, level, component, message, agent_id) VALUES (?1, 'INFO', 'opc', 'msg2', 'agent_b')",
            params![today_ts],
        )
        .unwrap();

        // 昨日1条
        conn.execute(
            "INSERT INTO log_entries (timestamp, level, component, message, agent_id) VALUES (?1, 'INFO', 'opc', 'msg3', 'agent_a')",
            params![yesterday_ts],
        )
        .unwrap();

        drop(conn);

        // Use an opc_id that does not equal the component column value ("opc")
        // to avoid the operator-precedence issue in the existing SQL query.
        let stats = get_opc_stats(&pool, "test_opc").unwrap();

        assert_eq!(stats.today_messages, 2, "today_messages should be 2");
        assert_eq!(stats.yesterday_messages, 1, "yesterday_messages should be 1");
        // 增长率：(2-1)/1 * 100 = 100.0%
        assert!(
            (stats.message_growth_pct - 100.0).abs() < 1e-9,
            "message_growth_pct should be 100.0, got {}",
            stats.message_growth_pct
        );

        // agent_stats 应包含 agent_a 和 agent_b（今日各1条）
        assert_eq!(stats.agent_stats.len(), 2, "should have 2 agent entries");
        let ids: Vec<Option<String>> = stats
            .agent_stats
            .iter()
            .map(|a| a.agent_id.clone())
            .collect();
        assert!(ids.contains(&Some("agent_a".to_string())));
        assert!(ids.contains(&Some("agent_b".to_string())));
    }

    #[test]
    fn test_negative_growth() {
        use rusqlite::params;

        let pool = setup();
        let conn = pool.get().unwrap();

        insert_fixtures(&conn);

        let today_start = Utc::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let yesterday_start = today_start - 86_400;
        let yesterday_ts = yesterday_start + 3600;

        // 今日0条，昨日1条
        conn.execute(
            "INSERT INTO log_entries (timestamp, level, component, message, agent_id) VALUES (?1, 'INFO', 'opc', 'msg_old', 'agent_a')",
            params![yesterday_ts],
        )
        .unwrap();

        drop(conn);

        // Use an opc_id that does not equal the component column value ("opc")
        // to avoid the operator-precedence issue in the existing SQL query.
        let stats = get_opc_stats(&pool, "test_opc").unwrap();

        assert_eq!(stats.today_messages, 0, "today_messages should be 0");
        assert_eq!(stats.yesterday_messages, 1, "yesterday_messages should be 1");
        // 增长率：(0-1)/1 * 100 = -100.0%
        assert!(
            (stats.message_growth_pct - (-100.0)).abs() < 1e-9,
            "message_growth_pct should be -100.0, got {}",
            stats.message_growth_pct
        );
    }

    #[test]
    fn test_daily_trend_with_data() {
        use rusqlite::params;

        let pool = setup();
        let conn = pool.get().unwrap();

        let today_start = Utc::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let today_ts = today_start + 3600;

        // log_entries.agent_id is nullable; insert without it to avoid FK dependency
        conn.execute(
            "INSERT INTO log_entries (timestamp, level, message) VALUES (?1, 'INFO', 'trend_msg')",
            params![today_ts],
        )
        .unwrap();

        drop(conn);

        let trend = get_daily_message_trend(&pool, 7).unwrap();
        assert_eq!(trend.len(), 7);

        // 最後の要素が今日（day_offset == 0）
        let today_entry = trend.iter().find(|d| d.day_offset == 0).unwrap();
        assert!(
            today_entry.message_count > 0,
            "today's message_count should be > 0, got {}",
            today_entry.message_count
        );
    }
}
