use rusqlite::params;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

/// Get OPC name by ID, returns NotFound error if not found.
pub fn get_opc_name(pool: &DbPool, opc_id: &str) -> Result<String> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT name FROM opc_config WHERE id = ?1",
        params![opc_id],
        |r| r.get(0),
    )
    .map_err(|_| AppError::NotFound(format!("OPC not found: {opc_id}")))
}

/// Get office name by ID, returns NotFound error if not found.
pub fn get_office_name(pool: &DbPool, office_id: &str) -> Result<String> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT name FROM offices WHERE id = ?1",
        params![office_id],
        |r| r.get(0),
    )
    .map_err(|_| AppError::NotFound(format!("Office not found: {office_id}")))
}

/// Get the daemon_url for an office by ID.
pub fn get_office_daemon_url(pool: &DbPool, office_id: &str) -> Result<String> {
    let conn = pool.get()?;
    let url: Option<String> = conn
        .query_row(
            "SELECT daemon_url FROM offices WHERE id = ?1",
            params![office_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("Office not found: {office_id}")))?;
    url.ok_or_else(|| {
        AppError::Validation(format!(
            "Office {office_id} has no daemon_url configured"
        ))
    })
}

/// Get a setting value by key, returns None if not found.
pub fn get_setting(pool: &DbPool, key: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .ok();
    Ok(value)
}

/// Set a setting value (upsert).
pub fn set_setting(pool: &DbPool, key: &str, value: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Get bailian provider credentials (api_key_encrypted, base_url).
///
/// Returns NotFound if bailian is not configured or not enabled.
pub fn get_bailian_credentials(pool: &DbPool) -> Result<(String, String)> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT api_key, base_url FROM model_providers_v2 WHERE name = 'bailian' AND is_enabled = 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(
            "BAILIAN 未配置，请先在模型管理页完成配置并测试连接".to_string(),
        ),
        other => AppError::Database(other),
    })
}

/// Write a log entry to the database. Silently ignores errors.
pub fn write_log(pool: &DbPool, level: &str, component: &str, message: &str) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT INTO log_entries (timestamp, level, component, message) VALUES (?1, ?2, ?3, ?4)",
            params![chrono::Utc::now().timestamp(), level, component, message],
        );
    }
}

/// Get agent count for an OPC.
pub fn get_agent_count(pool: &DbPool, opc_id: &str) -> Result<i64> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE opc_id = ?1",
        params![opc_id],
        |r| r.get(0),
    )
    .map_err(AppError::Database)
}

/// Get channel count for an OPC.
pub fn get_channel_count(pool: &DbPool, opc_id: &str) -> Result<i64> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT COUNT(*) FROM channels WHERE opc_id = ?1",
        params![opc_id],
        |r| r.get(0),
    )
    .map_err(AppError::Database)
}
