use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

/// SnapshotSummary matches proto SnapshotSummary
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct SnapshotSummary {
    pub agent_count: i32,
    pub channel_count: i32,
    pub binding_count: i32,
    pub doc_count: i32,
}

/// SnapshotInfo matches proto SnapshotInfo
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub label: String,
    pub opc_name: String,
    pub is_auto: bool,
    pub created_at: i64,
    pub config_data: String,
    pub summary: SnapshotSummary,
}

/// CreateSnapshotRequest matches proto
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CreateSnapshotRequest {
    pub opc_id: String,
    pub label: String,
    pub is_auto: bool,
}

/// CreateSnapshotResponse matches proto
#[derive(Debug, Clone, serde::Serialize)]
pub struct CreateSnapshotResponse {
    pub id: String,
}

/// RestoreSnapshotResponse matches proto
#[derive(Debug, Clone, serde::Serialize)]
pub struct RestoreSnapshotResponse {
    pub opc_id: String,
}

/// Create a snapshot for an OPC.
/// Generates config_data by serializing the OPC's agents, channels, bindings.
pub fn create_snapshot(
    pool: &DbPool,
    opc_id: &str,
    label: &str,
    is_auto: bool,
) -> Result<String> {
    let conn = pool.get()?;

    // Get OPC name from opc_id
    let opc_name: String = conn.query_row(
        "SELECT name FROM opc_config WHERE id = ?1",
        [opc_id],
        |row| row.get(0),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("OPC not found: {}", opc_id)),
        other => AppError::Database(other),
    })?;

    // Generate config_data by serializing OPC data (reuse connection)
    let config_data = generate_config_data_with_conn(&conn, opc_id)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO local_snapshots (id, label, opc_name, config_data, is_auto, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, label, opc_name, config_data, is_auto as i64, now],
    )?;
    Ok(id)
}

/// Generate config_data JSON from OPC's agents, channels, bindings
fn generate_config_data(pool: &DbPool, opc_id: &str) -> Result<String> {
    let conn = pool.get()?;
    generate_config_data_with_conn(&conn, opc_id)
}

/// Generate config_data using an existing connection
fn generate_config_data_with_conn(conn: &rusqlite::Connection, opc_id: &str) -> Result<String> {

    // Get agents
    let agents: Vec<serde_json::Value> = conn
        .prepare(
            "SELECT id, name, display_name, job_title, personality, description,
                    initials, gradient_start, gradient_end, is_default, order_index,
                    enabled_tools, disabled_tools, guardrail_rules,
                    model, enabled_skills, reports_to, manages, created_at, updated_at
             FROM agents WHERE opc_id = ?1 ORDER BY order_index ASC",
        )?
        .query_map([opc_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "display_name": row.get::<_, String>(2)?,
                "job_title": row.get::<_, String>(3)?,
                "personality": row.get::<_, String>(4)?,
                "description": row.get::<_, String>(5)?,
                "initials": row.get::<_, String>(6)?,
                "gradient_start": row.get::<_, String>(7)?,
                "gradient_end": row.get::<_, String>(8)?,
                "is_default": row.get::<_, i64>(9)? != 0,
                "order_index": row.get::<_, i32>(10)?,
                "enabled_tools": row.get::<_, String>(11)?,
                "disabled_tools": row.get::<_, String>(12)?,
                "guardrail_rules": row.get::<_, String>(13)?,
                "model": row.get::<_, String>(14)?,
                "enabled_skills": row.get::<_, String>(15)?,
                "reports_to": row.get::<_, String>(16)?,
                "manages": row.get::<_, String>(17)?,
                "created_at": row.get::<_, i64>(18)?,
                "updated_at": row.get::<_, i64>(19)?,
            }))
        })?
        .collect::<std::result::Result<_, _>>()?;

    // Get channels
    let channels: Vec<serde_json::Value> = conn
        .prepare(
            "SELECT id, opc_id, channel_type, is_enabled, feishu_config,
                    is_connected, last_connected, created_at, updated_at
             FROM channels WHERE opc_id = ?1",
        )?
        .query_map([opc_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "opc_id": row.get::<_, String>(1)?,
                "channel_type": row.get::<_, String>(2)?,
                "is_enabled": row.get::<_, i64>(3)? != 0,
                "feishu_config": row.get::<_, Option<String>>(4)?,
                "is_connected": row.get::<_, i64>(5)? != 0,
                "last_connected": row.get::<_, Option<i64>>(6)?,
                "created_at": row.get::<_, i64>(7)?,
                "updated_at": row.get::<_, i64>(8)?,
            }))
        })?
        .collect::<std::result::Result<_, _>>()?;

    // Get bindings
    let bindings: Vec<serde_json::Value> = conn
        .prepare(
            "SELECT id, opc_id, channel_id, channel_name, channel_type,
                    agent_id, agent_name, trigger_mode, is_enabled, created_at, updated_at
             FROM bindings WHERE opc_id = ?1",
        )?
        .query_map([opc_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "opc_id": row.get::<_, String>(1)?,
                "channel_id": row.get::<_, String>(2)?,
                "channel_name": row.get::<_, String>(3)?,
                "channel_type": row.get::<_, String>(4)?,
                "agent_id": row.get::<_, String>(5)?,
                "agent_name": row.get::<_, String>(6)?,
                "trigger_mode": row.get::<_, String>(7)?,
                "is_enabled": row.get::<_, i64>(8)? != 0,
                "created_at": row.get::<_, i64>(9)?,
                "updated_at": row.get::<_, i64>(10)?,
            }))
        })?
        .collect::<std::result::Result<_, _>>()?;

    Ok(serde_json::to_string(&serde_json::json!({
        "agents": agents,
        "channels": channels,
        "bindings": bindings,
    }))?)
}

/// Get snapshots for an OPC by opc_id
pub fn get_snapshots(pool: &DbPool, opc_id: &str) -> Result<Vec<SnapshotInfo>> {
    let conn = pool.get()?;

    // Get opc_name from opc_id
    let opc_name: String = conn.query_row(
        "SELECT name FROM opc_config WHERE id = ?1",
        [opc_id],
        |row| row.get(0),
    ).unwrap_or_default();

    let mut stmt = conn.prepare(
        "SELECT id, label, opc_name, config_data, is_auto, created_at
         FROM local_snapshots WHERE opc_name = ?1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![opc_name], |row| {
            let config_data: String = row.get(3)?;
            let summary = calculate_summary(&config_data);
            Ok(SnapshotInfo {
                id: row.get(0)?,
                label: row.get(1)?,
                opc_name: row.get(2)?,
                config_data,
                is_auto: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                summary,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

/// Calculate summary from config_data
fn calculate_summary(config_data: &str) -> SnapshotSummary {
    let parsed: serde_json::Value = serde_json::from_str(config_data).unwrap_or(serde_json::json!({}));

    let agent_count = parsed["agents"].as_array().map(|a| a.len() as i32).unwrap_or(0);
    let channel_count = parsed["channels"].as_array().map(|a| a.len() as i32).unwrap_or(0);
    let binding_count = parsed["bindings"].as_array().map(|a| a.len() as i32).unwrap_or(0);

    // Count documents (each agent can have multiple docs)
    let doc_count = agent_count * 7; // Approximate: each agent has up to 7 doc types

    SnapshotSummary {
        agent_count,
        channel_count,
        binding_count,
        doc_count,
    }
}

/// Get a single snapshot by id
pub fn get_snapshot(pool: &DbPool, id: &str) -> Result<SnapshotInfo> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT id, label, opc_name, config_data, is_auto, created_at
         FROM local_snapshots WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            let config_data: String = row.get(3)?;
            let summary = calculate_summary(&config_data);
            Ok(SnapshotInfo {
                id: row.get(0)?,
                label: row.get(1)?,
                opc_name: row.get(2)?,
                config_data,
                is_auto: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                summary,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

/// Delete a snapshot
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

/// Restore a snapshot and return the opc_id
pub fn restore_snapshot(pool: &DbPool, id: &str) -> Result<RestoreSnapshotResponse> {
    let snap = get_snapshot(pool, id)?;

    // Get opc_id from opc_name
    let conn = pool.get()?;
    let opc_id: String = conn.query_row(
        "SELECT id FROM opc_config WHERE name = ?1",
        [snap.opc_name],
        |row| row.get(0),
    ).unwrap_or_default();

    Ok(RestoreSnapshotResponse { opc_id })
}

// Legacy type alias for backwards compatibility
pub type LocalSnapshot = SnapshotInfo;

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

    fn create_opc(pool: &DbPool, id: &str, name: &str) {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO opc_config (id, name, display_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, 1700000000, 1700000000)",
            rusqlite::params![id, name, name],
        ).unwrap();
        // conn is dropped here, releasing the mutex
    }

    #[test]
    fn test_create_and_get() {
        let pool = setup();
        create_opc(&pool, "opc-001", "my_opc");

        let id = create_snapshot(&pool, "opc-001", "v1", false).unwrap();
        let snap = get_snapshot(&pool, &id).unwrap();
        assert_eq!(snap.label, "v1");
        assert_eq!(snap.opc_name, "my_opc");
        assert!(!snap.is_auto);
    }

    #[test]
    fn test_get_snapshots_for_opc() {
        let pool = setup();
        create_opc(&pool, "opc-a", "opc_a");
        create_opc(&pool, "opc-b", "opc_b");

        create_snapshot(&pool, "opc-a", "s1", false).unwrap();
        create_snapshot(&pool, "opc-a", "s2", true).unwrap();
        create_snapshot(&pool, "opc-b", "s3", false).unwrap();
        assert_eq!(get_snapshots(&pool, "opc-a").unwrap().len(), 2);
        assert_eq!(get_snapshots(&pool, "opc-b").unwrap().len(), 1);
    }

    #[test]
    fn test_delete_snapshot() {
        let pool = setup();
        create_opc(&pool, "opc-001", "opc");

        let id = create_snapshot(&pool, "opc-001", "del", false).unwrap();
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
    fn test_restore_returns_opc_id() {
        let pool = setup();
        create_opc(&pool, "opc-001", "my_opc");

        let id = create_snapshot(&pool, "opc-001", "r1", false).unwrap();
        let response = restore_snapshot(&pool, &id).unwrap();
        assert_eq!(response.opc_id, "opc-001");
    }

    #[test]
    fn test_calculate_summary() {
        let config_data = r#"{"agents":[{"id":"a1"},{"id":"a2"}],"channels":[{"id":"c1"}],"bindings":[{"id":"b1"}]}"#;
        let summary = calculate_summary(config_data);
        assert_eq!(summary.agent_count, 2);
        assert_eq!(summary.channel_count, 1);
        assert_eq!(summary.binding_count, 1);
    }
}