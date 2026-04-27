use crate::database::pool::DbPool;
use crate::error::Result;
use crate::utils::crypto;

/// 単一パスでスキーマを初期化する。
///
/// バージョン管理は不要：製品未リリースのため、
/// 最初は空のデータベースから始まり、全テーブルを一度に作成する。
pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(crate::database::schema::SCHEMA)?;
    drop(conn);
    backfill_office_password_encryption(pool)?;
    Ok(())
}

/// One-shot data migration: encrypt any plaintext secrets in `offices`
/// (`access_password` and `ssh_key_path`) left over from before A1 was fixed.
/// Idempotent: rows whose value already starts with the `enc:` prefix are
/// skipped, so safe to run on every startup.
fn backfill_office_password_encryption(pool: &DbPool) -> Result<()> {
    backfill_office_column(pool, "access_password")?;
    backfill_office_column(pool, "ssh_key_path")?;
    Ok(())
}

fn backfill_office_column(pool: &DbPool, column: &str) -> Result<()> {
    let conn = pool.get()?;
    // Collect rows that need re-encryption first (avoid holding a borrowed stmt while writing).
    let select_sql = format!(
        "SELECT id, {col} FROM offices WHERE {col} IS NOT NULL AND {col} <> ''",
        col = column
    );
    let plaintext_rows: Vec<(String, String)> = {
        let mut stmt = conn.prepare(&select_sql)?;
        let mut out = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let value: String = row.get(1)?;
            if !value.starts_with("enc:") {
                out.push((id, value));
            }
        }
        out
    };

    if plaintext_rows.is_empty() {
        return Ok(());
    }

    let update_sql = format!("UPDATE offices SET {col} = ?1 WHERE id = ?2", col = column);
    for (id, plaintext) in plaintext_rows {
        let encrypted = crypto::encrypt(&plaintext)?;
        conn.execute(&update_sql, rusqlite::params![encrypted, id])?;
    }
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
            "model_providers_v2",
            "model_info_v2",
            "channels",
            "bindings",
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
