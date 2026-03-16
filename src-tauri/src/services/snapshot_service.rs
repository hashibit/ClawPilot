use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LocalSnapshot {
    pub id: String,
    pub label: String,
    pub opc_name: String,
    pub config_data: String,
    pub is_auto: bool,
    pub created_at: i64,
}

pub fn create_snapshot(
    pool: &DbPool,
    opc_name: &str,
    label: &str,
    config_data: &str,
    is_auto: bool,
) -> Result<String> {
    let conn = pool.get()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO local_snapshots (id, label, opc_name, config_data, is_auto, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, label, opc_name, config_data, is_auto as i64, now],
    )?;
    Ok(id)
}

pub fn get_snapshots(pool: &DbPool, opc_name: &str) -> Result<Vec<LocalSnapshot>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, label, opc_name, config_data, is_auto, created_at
         FROM local_snapshots WHERE opc_name = ?1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![opc_name], |row| {
            Ok(LocalSnapshot {
                id: row.get(0)?,
                label: row.get(1)?,
                opc_name: row.get(2)?,
                config_data: row.get(3)?,
                is_auto: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_snapshot(pool: &DbPool, id: &str) -> Result<LocalSnapshot> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT id, label, opc_name, config_data, is_auto, created_at
         FROM local_snapshots WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(LocalSnapshot {
                id: row.get(0)?,
                label: row.get(1)?,
                opc_name: row.get(2)?,
                config_data: row.get(3)?,
                is_auto: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn delete_snapshot(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let affected = conn.execute(
        "DELETE FROM local_snapshots WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok(())
}

/// Returns the config_data stored in the snapshot so the caller can re-apply it.
pub fn restore_snapshot(pool: &DbPool, id: &str) -> Result<String> {
    let snap = get_snapshot(pool, id)?;
    Ok(snap.config_data)
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
    fn test_create_and_get() {
        let pool = setup();
        let id = create_snapshot(&pool, "my_opc", "v1", r#"{"k":"v"}"#, false).unwrap();
        let snap = get_snapshot(&pool, &id).unwrap();
        assert_eq!(snap.label, "v1");
        assert_eq!(snap.opc_name, "my_opc");
        assert!(!snap.is_auto);
    }

    #[test]
    fn test_get_snapshots_for_opc() {
        let pool = setup();
        create_snapshot(&pool, "opc_a", "s1", "{}", false).unwrap();
        create_snapshot(&pool, "opc_a", "s2", "{}", true).unwrap();
        create_snapshot(&pool, "opc_b", "s3", "{}", false).unwrap();
        assert_eq!(get_snapshots(&pool, "opc_a").unwrap().len(), 2);
        assert_eq!(get_snapshots(&pool, "opc_b").unwrap().len(), 1);
    }

    #[test]
    fn test_delete_snapshot() {
        let pool = setup();
        let id = create_snapshot(&pool, "opc", "del", "{}", false).unwrap();
        delete_snapshot(&pool, &id).unwrap();
        assert!(matches!(get_snapshot(&pool, &id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_nonexistent() {
        let pool = setup();
        assert!(matches!(
            delete_snapshot(&pool, "no-such-id"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn test_restore_returns_config_data() {
        let pool = setup();
        let data = r#"{"agents":["a","b"]}"#;
        let id = create_snapshot(&pool, "opc", "r1", data, false).unwrap();
        assert_eq!(restore_snapshot(&pool, &id).unwrap(), data);
    }
}
