use crate::database::pool::DbPool;
use crate::error::Result;

/// 単一パスでスキーマを初期化する。
///
/// バージョン管理は不要：製品未リリースのため、
/// 最初は空のデータベースから始まり、全テーブルを一度に作成する。
pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(crate::database::schema::SCHEMA)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// テスト用のインメモリ DbPool を構築する。
    fn in_memory_pool() -> DbPool {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )
        .expect("configure pragmas");
        DbPool::new_in_memory_for_test(conn)
    }

    #[test]
    fn test_schema_initialization() {
        let pool = in_memory_pool();
        run_migrations(&pool).expect("schema init should succeed");

        let conn = pool.get().expect("connection");

        let expected_tables = [
            "openclaw_config",
            "opc_config",
            "agents",
            "agent_documents",
            "model_providers",
            "model_info",
            "model_providers_v2",
            "model_info_v2",
            "channels",
            "bindings",
            "opc_defaults",
            "tools",
            "skills",
            "offices",
            "office_deployments",
            "local_snapshots",
            "deployment_tasks",
            "log_entries",
        ];

        for table in &expected_tables {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            assert_eq!(count, 1, "table '{}' should exist after schema init", table);
        }
    }

    #[test]
    fn test_schema_is_idempotent() {
        let pool = in_memory_pool();
        run_migrations(&pool).expect("first run");
        run_migrations(&pool).expect("second run should not error");
    }
}
