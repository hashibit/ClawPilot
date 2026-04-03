use crate::database::pool::DbPool;
use crate::error::Result;

/// データベースの現在のターゲットバージョン。
const CURRENT_VERSION: u32 = 3;

/// 未実行のマイグレーションをすべて実行する。
///
/// `PRAGMA user_version` でスキーマバージョンを管理する。
/// 各マイグレーションは冪等であり、複数回実行しても安全。
pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;

    let version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        // v0 → v1: すべてのコアテーブルを作成する
        conn.execute_batch(crate::database::schema::SCHEMA_V1)?;
        conn.execute_batch("PRAGMA user_version = 1")?;
    }

    if version < 2 {
        // v1 → v2: offices, office_deployments, and new columns on existing tables
        conn.execute_batch(crate::database::schema::MIGRATION_V2_TABLES)?;

        // ALTER TABLE statements that may fail if column already exists — ignore those errors
        let alters = [
            "ALTER TABLE opc_config ADD COLUMN office_id TEXT",
            "ALTER TABLE deployment_tasks ADD COLUMN opc_id TEXT",
            "ALTER TABLE deployment_tasks ADD COLUMN office_id TEXT",
            "ALTER TABLE deployment_tasks ADD COLUMN daemon_task_id TEXT",
            "ALTER TABLE deployment_tasks ADD COLUMN updated_at INTEGER",
            "ALTER TABLE skills ADD COLUMN display_name TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE skills ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE skills ADD COLUMN is_installed INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE skills ADD COLUMN install_path TEXT",
            "ALTER TABLE skills ADD COLUMN installed_at INTEGER",
            "ALTER TABLE skills ADD COLUMN download_url TEXT",
            "ALTER TABLE channels ADD COLUMN dingtalk_config TEXT",
            "ALTER TABLE channels ADD COLUMN slack_config TEXT",
            "ALTER TABLE model_providers ADD COLUMN base_url TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE model_providers ADD COLUMN is_coding_plan INTEGER NOT NULL DEFAULT 0",
        ];
        for stmt in &alters {
            // Ignore "duplicate column name" errors
            let _ = conn.execute_batch(stmt);
        }

        conn.execute_batch("PRAGMA user_version = 2")?;
    }

    if version < 3 {
        // v2 → v3: model_providers_v2 and model_info_v2 (name-keyed, flexible)
        conn.execute_batch(crate::database::schema::MIGRATION_V3_TABLES)?;
        conn.execute_batch("PRAGMA user_version = 3")?;
    }

    Ok(())
}

/// データベースに保存されている現在のスキーマバージョンを返す。
pub fn current_version(pool: &DbPool) -> Result<u32> {
    let conn = pool.get()?;
    let version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    Ok(version)
}

/// コードで定義されているターゲットバージョンを返す。
#[allow(dead_code)]
pub fn target_version() -> u32 {
    CURRENT_VERSION
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
    fn test_migration_sets_version_to_1() {
        let pool = in_memory_pool();
        run_migrations(&pool).expect("migrations should succeed");
        let v = current_version(&pool).expect("should get version");
        assert_eq!(v, 3, "user_version should be 3 after migration");
    }

    #[test]
    fn test_migration_is_idempotent() {
        let pool = in_memory_pool();
        run_migrations(&pool).expect("first run");
        run_migrations(&pool).expect("second run should not error");
        let v = current_version(&pool).expect("version after double run");
        assert_eq!(v, 3);
    }

    #[test]
    fn test_core_tables_exist() {
        let pool = in_memory_pool();
        run_migrations(&pool).expect("migrations");

        let conn = pool.get().expect("connection");

        let expected_tables = [
            "openclaw_config",
            "opc_config",
            "agents",
            "agent_documents",
            "model_providers",
            "model_info",
            "channels",
            "bindings",
            "opc_defaults",
            "tools",
            "skills",
            "local_snapshots",
            "deployment_tasks",
            "log_entries",
            "model_providers_v2",
            "model_info_v2",
        ];

        for table in &expected_tables {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            assert_eq!(count, 1, "table '{}' should exist after migration", table);
        }
    }

    #[test]
    fn test_target_version_constant() {
        assert_eq!(target_version(), 3);
    }
}
