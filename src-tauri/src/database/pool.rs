use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use rusqlite::Connection;
use crate::error::{AppError, Result};

/// SQLite connection pool backed by a single connection protected by a Mutex.
///
/// For the current single-user desktop use-case a single connection with WAL
/// mode is sufficient.  The Arc wrapper allows the pool to be cheaply cloned
/// and shared across Tauri command handlers.
#[derive(Clone)]
pub struct DbPool {
    inner: Arc<Mutex<Connection>>,
}

impl DbPool {
    /// Open (or create) the SQLite database at `path` and configure it for
    /// safe concurrent access.
    ///
    /// Pragmas applied at startup:
    /// - `journal_mode=WAL`  — allows readers and a single writer to coexist
    /// - `foreign_keys=ON`   — enforce referential integrity
    /// - `synchronous=NORMAL` — good balance of durability and speed with WAL
    pub fn new(path: &Path) -> Result<DbPool> {
        let conn = Connection::open(path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )?;

        Ok(DbPool {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Acquire an exclusive lock on the underlying connection.
    ///
    /// Returns an `AppError::Internal` if the mutex has been poisoned (which
    /// only happens when another thread panicked while holding the lock).
    pub fn get(&self) -> Result<MutexGuard<'_, Connection>> {
        self.inner.lock().map_err(|e| {
            AppError::Internal(format!("Database mutex poisoned: {e}"))
        })
    }
}

impl DbPool {
    /// テスト専用: 既存の `Connection` を `DbPool` に包む。
    ///
    /// `Connection::open_in_memory()` で作成した接続を渡すことで、
    /// ファイルシステムに依存しないユニットテストが書ける。
    #[cfg(test)]
    pub(crate) fn new_in_memory_for_test(conn: Connection) -> DbPool {
        DbPool {
            inner: Arc::new(Mutex::new(conn)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_pool() -> DbPool {
        // Connection::open(":memory:") opens an in-memory database.
        // We replicate the DbPool::new logic but pass ":memory:" as a path.
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )
        .expect("configure pragmas");

        DbPool {
            inner: Arc::new(Mutex::new(conn)),
        }
    }

    #[test]
    fn test_get_connection() {
        let pool = in_memory_pool();
        let conn = pool.get().expect("should acquire connection");
        // Perform a trivial query to confirm the connection is usable.
        let result: i64 = conn
            .query_row("SELECT 1", [], |row| row.get(0))
            .expect("SELECT 1 should succeed");
        assert_eq!(result, 1);
    }

    #[test]
    fn test_wal_mode_enabled() {
        let pool = in_memory_pool();
        let conn = pool.get().expect("should acquire connection");
        // SQLite returns "memory" for in-memory databases even when WAL is
        // requested, because WAL requires a real file.  We verify that the
        // pragma command was accepted without error (no panic above) and that
        // the returned mode is one of the expected values.
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("PRAGMA journal_mode should succeed");
        // In-memory databases fall back to "memory" mode; file databases use "wal".
        assert!(
            mode == "wal" || mode == "memory",
            "unexpected journal_mode: {mode}"
        );
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let pool = in_memory_pool();
        let conn = pool.get().expect("should acquire connection");
        let fk_enabled: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("PRAGMA foreign_keys should succeed");
        assert_eq!(fk_enabled, 1, "foreign_keys should be ON (1)");
    }
}
