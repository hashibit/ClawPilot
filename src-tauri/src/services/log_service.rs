use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::database::pool::DbPool;
use crate::error::Result;

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// A single row in the `log_entries` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: i64,
    pub timestamp: i64,
    pub level: String,
    pub component: Option<String>,
    pub message: String,
    pub agent_id: Option<String>,
    pub channel: Option<String>,
    /// Raw JSON metadata blob.
    pub metadata: Option<String>,
}

/// Return log entries ordered by `timestamp DESC`.
///
/// Optionally filter by `level` and/or `component`. At most `limit` rows are
/// returned (pass `i64::MAX` to fetch everything).
pub fn get_logs(
    pool: &DbPool,
    level: Option<&str>,
    component: Option<&str>,
    limit: i64,
) -> Result<Vec<LogEntry>> {
    let conn = pool.get()?;

    const SELECT: &str =
        "SELECT id, timestamp, level, component, message, agent_id, channel, metadata
         FROM log_entries";

    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(LogEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            level: row.get(2)?,
            component: row.get(3)?,
            message: row.get(4)?,
            agent_id: row.get(5)?,
            channel: row.get(6)?,
            metadata: row.get(7)?,
        })
    };

    // Use explicit match to keep param count in sync with the SQL.
    let rows: Vec<LogEntry> = match (level, component) {
        (None, None) => {
            let sql = format!("{SELECT} ORDER BY timestamp DESC LIMIT ?1");
            conn.prepare(&sql)?
                .query_map(rusqlite::params![limit], map_row)?
                .collect::<std::result::Result<_, _>>()?
        }
        (Some(lv), None) => {
            let sql = format!("{SELECT} WHERE level = ?1 ORDER BY timestamp DESC LIMIT ?2");
            conn.prepare(&sql)?
                .query_map(rusqlite::params![lv, limit], map_row)?
                .collect::<std::result::Result<_, _>>()?
        }
        (None, Some(cp)) => {
            let sql = format!("{SELECT} WHERE component = ?1 ORDER BY timestamp DESC LIMIT ?2");
            conn.prepare(&sql)?
                .query_map(rusqlite::params![cp, limit], map_row)?
                .collect::<std::result::Result<_, _>>()?
        }
        (Some(lv), Some(cp)) => {
            let sql = format!(
                "{SELECT} WHERE level = ?1 AND component = ?2 ORDER BY timestamp DESC LIMIT ?3"
            );
            conn.prepare(&sql)?
                .query_map(rusqlite::params![lv, cp, limit], map_row)?
                .collect::<std::result::Result<_, _>>()?
        }
    };

    Ok(rows)
}

/// Append one log entry and return its auto-generated row id.
///
/// `timestamp` is set to the current Unix epoch second automatically.
pub fn write_log(
    pool: &DbPool,
    level: &str,
    component: Option<&str>,
    message: &str,
    agent_id: Option<&str>,
    channel: Option<&str>,
) -> Result<i64> {
    let conn = pool.get()?;
    let ts = now_unix();

    conn.execute(
        "INSERT INTO log_entries
             (timestamp, level, component, message, agent_id, channel)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![ts, level, component, message, agent_id, channel],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Delete all log entries whose `timestamp` is strictly less than
/// `before_timestamp`.  Returns the number of deleted rows.
pub fn clear_old_logs(pool: &DbPool, before_timestamp: i64) -> Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute(
        "DELETE FROM log_entries WHERE timestamp < ?1",
        rusqlite::params![before_timestamp],
    )?;
    Ok(deleted)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::pool::DbPool;
    use rusqlite::Connection;

    fn setup_pool() -> DbPool {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             CREATE TABLE log_entries (
                 id        INTEGER PRIMARY KEY AUTOINCREMENT,
                 timestamp INTEGER NOT NULL,
                 level     TEXT NOT NULL,
                 component TEXT,
                 message   TEXT NOT NULL,
                 agent_id  TEXT,
                 channel   TEXT,
                 metadata  TEXT
             );",
        )
        .expect("create table");
        DbPool::new_in_memory_for_test(conn)
    }

    #[test]
    fn test_write_and_get_log() {
        let pool = setup_pool();

        let id = write_log(&pool, "INFO", Some("core"), "hello", None, None).expect("write");
        assert!(id > 0);

        let logs = get_logs(&pool, None, None, 100).expect("get_logs");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, id);
        assert_eq!(logs[0].level, "INFO");
        assert_eq!(logs[0].message, "hello");
        assert_eq!(logs[0].component.as_deref(), Some("core"));
    }

    #[test]
    fn test_get_logs_ordered_by_timestamp_desc() {
        let pool = setup_pool();

        // Insert rows with explicit timestamps via raw SQL so we control ordering.
        {
            let conn = pool.get().unwrap();
            conn.execute_batch(
                "INSERT INTO log_entries (timestamp, level, message) VALUES (100, 'INFO',  'first');
                 INSERT INTO log_entries (timestamp, level, message) VALUES (200, 'DEBUG', 'second');
                 INSERT INTO log_entries (timestamp, level, message) VALUES (300, 'WARN',  'third');",
            )
            .unwrap();
        }

        let logs = get_logs(&pool, None, None, 10).expect("get_logs");
        assert_eq!(logs.len(), 3);
        // Newest first.
        assert_eq!(logs[0].timestamp, 300);
        assert_eq!(logs[2].timestamp, 100);
    }

    #[test]
    fn test_get_logs_filter_by_level() {
        let pool = setup_pool();

        write_log(&pool, "INFO", None, "info msg", None, None).unwrap();
        write_log(&pool, "ERROR", None, "error msg", None, None).unwrap();
        write_log(&pool, "INFO", None, "another info", None, None).unwrap();

        let logs = get_logs(&pool, Some("INFO"), None, 100).expect("filter by level");
        assert_eq!(logs.len(), 2);
        assert!(logs.iter().all(|e| e.level == "INFO"));
    }

    #[test]
    fn test_get_logs_filter_by_component() {
        let pool = setup_pool();

        write_log(&pool, "INFO", Some("auth"), "login", None, None).unwrap();
        write_log(&pool, "INFO", Some("db"), "query", None, None).unwrap();

        let logs = get_logs(&pool, None, Some("auth"), 100).expect("filter by component");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].component.as_deref(), Some("auth"));
    }

    #[test]
    fn test_get_logs_filter_by_level_and_component() {
        let pool = setup_pool();

        write_log(&pool, "ERROR", Some("auth"), "bad creds", None, None).unwrap();
        write_log(&pool, "INFO", Some("auth"), "logout", None, None).unwrap();
        write_log(&pool, "ERROR", Some("db"), "timeout", None, None).unwrap();

        let logs = get_logs(&pool, Some("ERROR"), Some("auth"), 100).expect("combined filter");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].message, "bad creds");
    }

    #[test]
    fn test_get_logs_limit() {
        let pool = setup_pool();

        for i in 0..10 {
            write_log(&pool, "INFO", None, &format!("msg {i}"), None, None).unwrap();
        }

        let logs = get_logs(&pool, None, None, 3).expect("limited get_logs");
        assert_eq!(logs.len(), 3);
    }

    #[test]
    fn test_clear_old_logs() {
        let pool = setup_pool();

        {
            let conn = pool.get().unwrap();
            conn.execute_batch(
                "INSERT INTO log_entries (timestamp, level, message) VALUES (100, 'INFO', 'old1');
                 INSERT INTO log_entries (timestamp, level, message) VALUES (200, 'INFO', 'old2');
                 INSERT INTO log_entries (timestamp, level, message) VALUES (300, 'INFO', 'keep');",
            )
            .unwrap();
        }

        let deleted = clear_old_logs(&pool, 250).expect("clear");
        assert_eq!(deleted, 2);

        let remaining = get_logs(&pool, None, None, 100).expect("after clear");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].timestamp, 300);
    }

    #[test]
    fn test_clear_old_logs_boundary_exclusive() {
        let pool = setup_pool();

        {
            let conn = pool.get().unwrap();
            conn.execute_batch(
                "INSERT INTO log_entries (timestamp, level, message) VALUES (100, 'INFO', 'a');
                 INSERT INTO log_entries (timestamp, level, message) VALUES (100, 'INFO', 'b');",
            )
            .unwrap();
        }

        // Boundary is exclusive: timestamp < 100 deletes nothing.
        let deleted = clear_old_logs(&pool, 100).expect("clear boundary");
        assert_eq!(deleted, 0);
    }

    #[test]
    fn test_write_log_with_optional_fields() {
        let pool = setup_pool();

        let id = write_log(
            &pool,
            "WARN",
            Some("scheduler"),
            "retry limit",
            Some("agent-42"),
            Some("lark"),
        )
        .expect("write with optional fields");

        let logs = get_logs(&pool, None, None, 10).unwrap();
        assert_eq!(logs.len(), 1);
        let e = &logs[0];
        assert_eq!(e.id, id);
        assert_eq!(e.agent_id.as_deref(), Some("agent-42"));
        assert_eq!(e.channel.as_deref(), Some("lark"));
    }
}
