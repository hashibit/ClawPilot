/// openclaw/stats.rs
/// 从数据库日志解析消息统计与增长趋势
use chrono::{Duration, Utc};
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
        .unwrap()
        .and_utc()
        .timestamp();
    let yesterday_start = today_start - 86_400;

    // 今日消息数（来自 log 表，opc 相关组件）
    let today_messages: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM log_entries
             WHERE timestamp >= ?1 AND component LIKE '%opc%' OR component = ?2",
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
pub fn get_daily_message_trend(pool: &DbPool, days: u32) -> Result<Vec<DailyStats>> {
    let conn = pool.get()?;
    let mut result = Vec::with_capacity(days as usize);

    for i in (0..days).rev() {
        let day_start = (Utc::now() - Duration::days(i as i64))
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let day_end = day_start + 86_400;

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM log_entries WHERE timestamp >= ?1 AND timestamp < ?2",
                rusqlite::params![day_start, day_end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        result.push(DailyStats {
            day_offset: i as i32,
            timestamp: day_start,
            message_count: count,
        });
    }

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
}
