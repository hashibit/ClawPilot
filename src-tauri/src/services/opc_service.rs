use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::opc::{OpcConfig, OpcStats};

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper helper
// ─────────────────────────────────────────────────────────────────────────────

fn row_to_opc(row: &rusqlite::Row) -> rusqlite::Result<OpcConfig> {
    let is_active_raw: i64 = row.get(6)?;
    let is_running_raw: i64 = row.get(7)?;
    Ok(OpcConfig {
        id: row.get(0)?,
        name: row.get(1)?,
        display_name: row.get(2)?,
        description: row.get(3)?,
        avatar_color: row.get(4)?,
        avatar_initials: row.get(5)?,
        is_active: OpcConfig::i64_to_bool(is_active_raw),
        is_running: OpcConfig::i64_to_bool(is_running_raw),
        agent_count: row.get(8)?,
        channel_count: row.get(9)?,
        message_count_today: row.get(10)?,
        message_growth: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        office_id: row.get(14).ok().flatten(),
        office_name: row.get(15).ok().flatten(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Returns all OPC configs ordered by created_at ascending.
pub fn get_all_opcs(pool: &DbPool) -> Result<Vec<OpcConfig>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT oc.id, oc.name, oc.display_name, oc.description, oc.avatar_color, oc.avatar_initials,
                oc.is_active, oc.is_running, oc.agent_count, oc.channel_count,
                oc.message_count_today, oc.message_growth, oc.created_at, oc.updated_at,
                oc.office_id, o.name
         FROM opc_config oc
         LEFT JOIN offices o ON o.id = oc.office_id
         ORDER BY oc.created_at ASC",
    )?;
    let opcs = stmt
        .query_map([], row_to_opc)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(opcs)
}

/// Returns a single OPC config by ID. Returns `AppError::NotFound` when absent.
pub fn get_opc(pool: &DbPool, id: &str) -> Result<OpcConfig> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT oc.id, oc.name, oc.display_name, oc.description, oc.avatar_color, oc.avatar_initials,
                oc.is_active, oc.is_running, oc.agent_count, oc.channel_count,
                oc.message_count_today, oc.message_growth, oc.created_at, oc.updated_at,
                oc.office_id, o.name
         FROM opc_config oc
         LEFT JOIN offices o ON o.id = oc.office_id
         WHERE oc.id = ?1",
        rusqlite::params![id],
        row_to_opc,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("OPC not found: {id}"))
        }
        other => AppError::Database(other),
    })
}

/// Inserts a new OPC config, overriding the `id`, `created_at`, and `updated_at`
/// fields with freshly generated values. Returns the new ID.
pub fn create_opc(pool: &DbPool, config: OpcConfig) -> Result<String> {
    // Respect client-supplied id; fall back to auto-generated UUID (matches server behavior)
    let new_id = if config.id.is_empty() {
        format!("opc-{}", Uuid::new_v4().to_string().replace('-', "").chars().take(12).collect::<String>())
    } else {
        config.id.clone()
    };
    let now = Utc::now().timestamp();
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO opc_config
             (id, name, display_name, description, avatar_color, avatar_initials,
              is_active, is_running, agent_count, channel_count,
              message_count_today, message_growth, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            new_id,
            config.name,
            config.display_name,
            config.description,
            config.avatar_color,
            config.avatar_initials,
            OpcConfig::bool_to_i64(config.is_active),
            OpcConfig::bool_to_i64(config.is_running),
            config.agent_count,
            config.channel_count,
            config.message_count_today,
            config.message_growth,
            now,
            now,
        ],
    )?;
    Ok(new_id)
}

/// Updates an existing OPC config. Returns `AppError::NotFound` when the
/// record does not exist.
pub fn update_opc(pool: &DbPool, id: &str, config: OpcConfig) -> Result<()> {
    let now = Utc::now().timestamp();
    let conn = pool.get()?;
    let rows = conn.execute(
        "UPDATE opc_config
         SET name = ?2, display_name = ?3, description = ?4,
             avatar_color = ?5, avatar_initials = ?6,
             is_active = ?7, is_running = ?8,
             agent_count = ?9, channel_count = ?10,
             message_count_today = ?11, message_growth = ?12,
             updated_at = ?13
         WHERE id = ?1",
        rusqlite::params![
            id,
            config.name,
            config.display_name,
            config.description,
            config.avatar_color,
            config.avatar_initials,
            OpcConfig::bool_to_i64(config.is_active),
            OpcConfig::bool_to_i64(config.is_running),
            config.agent_count,
            config.channel_count,
            config.message_count_today,
            config.message_growth,
            now,
        ],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("OPC not found: {id}")));
    }
    Ok(())
}

/// Deletes an OPC config. Returns `AppError::NotFound` when the record does
/// not exist.
pub fn delete_opc(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let rows = conn.execute(
        "DELETE FROM opc_config WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("OPC not found: {id}")));
    }
    Ok(())
}

/// Sets `openclaw_config.current_opc` to `id`. Verifies that the referenced
/// OPC exists first. Creates the singleton config row if it does not yet exist.
pub fn set_current_opc(pool: &DbPool, id: &str) -> Result<()> {
    // Validate that the referenced OPC exists.
    get_opc(pool, id)?;

    let now = Utc::now().timestamp();
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO openclaw_config (id, current_opc, last_updated)
         VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET current_opc = excluded.current_opc,
                                       last_updated = excluded.last_updated",
        rusqlite::params![id, now],
    )?;
    Ok(())
}

/// Returns the OPC config that is currently selected in `openclaw_config`.
///
/// On first launch (empty table) a default row is inserted using the first
/// available OPC, or an error is returned when there are no OPCs at all.
pub fn get_current_opc(pool: &DbPool) -> Result<OpcConfig> {
    let current_id: Option<String> = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT current_opc FROM openclaw_config WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?
    };

    match current_id {
        Some(id) => get_opc(pool, &id),
        None => {
            // First launch: pick the first existing OPC and persist it.
            let all = get_all_opcs(pool)?;
            let first = all
                .into_iter()
                .next()
                .ok_or_else(|| AppError::NotFound("No OPC configs exist".to_string()))?;
            set_current_opc(pool, &first.id)?;
            Ok(first)
        }
    }
}

/// Returns statistics derived from the OPC config row.
pub fn get_opc_stats(pool: &DbPool, opc_id: &str) -> Result<OpcStats> {
    let opc = get_opc(pool, opc_id)?;
    Ok(opc.stats())
}

/// 重新计算并持久化 OPC 的 agent_count 和 channel_count。
pub fn update_opc_stats(pool: &DbPool, id: &str) -> Result<()> {
    let now = Utc::now().timestamp();
    let conn = pool.get()?;
    let agent_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE opc_id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;
    let channel_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM channels WHERE opc_id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;
    let rows = conn.execute(
        "UPDATE opc_config SET agent_count = ?2, channel_count = ?3, updated_at = ?4 WHERE id = ?1",
        rusqlite::params![id, agent_count, channel_count, now],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("OPC not found: {id}")));
    }
    Ok(())
}

/// Serialises an OPC config to a JSON string for export.
pub fn export_opc(pool: &DbPool, opc_id: &str) -> Result<String> {
    let opc = get_opc(pool, opc_id)?;
    let json = serde_json::to_string(&opc)?;
    Ok(json)
}

/// Deserialises an OPC config from a JSON string and inserts it as a new
/// record (new ID, new timestamps). Returns the new ID.
///
/// If the `name` from the imported JSON already exists in the database, a
/// unique suffix is appended so the import never fails with a constraint error.
pub fn import_opc(pool: &DbPool, json: &str) -> Result<String> {
    let mut config: OpcConfig = serde_json::from_str(json)?;

    // Always generate a fresh ID on import to avoid collisions
    config.id = String::new();

    // Ensure the name is unique by appending a short UUID segment when needed.
    let name_taken: bool = {
        let conn = pool.get()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM opc_config WHERE name = ?1",
            rusqlite::params![config.name],
            |row| row.get(0),
        )?;
        count > 0
    };

    if name_taken {
        let suffix = &Uuid::new_v4().to_string()[..8];
        config.name = format!("{}-{}", config.name, suffix);
    }

    create_opc(pool, config)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper trait re-export so tests can call `.optional()`
// ─────────────────────────────────────────────────────────────────────────────

trait OptionalExt<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalExt<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )
        .expect("configure pragmas");
        let pool = DbPool::new_in_memory_for_test(conn);
        crate::database::migrations::run_migrations(&pool).expect("run migrations");
        pool
    }

    fn sample_config(name: &str) -> OpcConfig {
        OpcConfig {
            id: String::new(), // overridden by create_opc
            name: name.to_string(),
            display_name: format!("Display {name}"),
            description: Some("A test OPC".to_string()),
            avatar_color: Some("#123456".to_string()),
            avatar_initials: Some("TS".to_string()),
            is_active: false,
            is_running: false,
            agent_count: 2,
            channel_count: 1,
            message_count_today: 10,
            message_growth: 1.5,
            office_id: None,
            office_name: None,
            created_at: 0,  // overridden by create_opc
            updated_at: 0,  // overridden by create_opc
        }
    }

    // ── CRUD lifecycle ────────────────────────────────────────────────────────

    #[test]
    fn test_create_get_update_delete_lifecycle() {
        let pool = setup();

        // create
        let id = create_opc(&pool, sample_config("alpha")).expect("create");
        assert!(!id.is_empty());

        // get
        let opc = get_opc(&pool, &id).expect("get after create");
        assert_eq!(opc.name, "alpha");
        assert_eq!(opc.id, id);
        assert!(opc.created_at > 0);
        assert!(opc.updated_at > 0);

        // update
        let mut updated = opc.clone();
        updated.display_name = "Updated Alpha".to_string();
        updated.agent_count = 5;
        update_opc(&pool, &id, updated).expect("update");

        let fetched = get_opc(&pool, &id).expect("get after update");
        assert_eq!(fetched.display_name, "Updated Alpha");
        assert_eq!(fetched.agent_count, 5);

        // get_all
        let all = get_all_opcs(&pool).expect("get_all");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, id);

        // delete
        delete_opc(&pool, &id).expect("delete");

        let result = get_opc(&pool, &id);
        assert!(matches!(result, Err(AppError::NotFound(_))));

        let all_after = get_all_opcs(&pool).expect("get_all after delete");
        assert!(all_after.is_empty());
    }

    #[test]
    fn test_get_nonexistent_returns_not_found() {
        let pool = setup();
        let result = get_opc(&pool, "nonexistent-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_update_nonexistent_returns_not_found() {
        let pool = setup();
        let result = update_opc(&pool, "ghost", sample_config("ghost"));
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_nonexistent_returns_not_found() {
        let pool = setup();
        let result = delete_opc(&pool, "ghost");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ── set_current_opc / get_current_opc ────────────────────────────────────

    #[test]
    fn test_set_and_get_current_opc() {
        let pool = setup();

        let id1 = create_opc(&pool, sample_config("opc-one")).expect("create opc-one");
        let id2 = create_opc(&pool, sample_config("opc-two")).expect("create opc-two");

        set_current_opc(&pool, &id1).expect("set current to opc-one");
        let current = get_current_opc(&pool).expect("get current");
        assert_eq!(current.id, id1);

        // switch to second
        set_current_opc(&pool, &id2).expect("set current to opc-two");
        let current2 = get_current_opc(&pool).expect("get current after switch");
        assert_eq!(current2.id, id2);
    }

    #[test]
    fn test_get_current_opc_on_first_launch_picks_first() {
        let pool = setup();

        // No openclaw_config row yet — get_current_opc should bootstrap.
        let id = create_opc(&pool, sample_config("boot")).expect("create");
        let current = get_current_opc(&pool).expect("get current on first launch");
        assert_eq!(current.id, id);
    }

    #[test]
    fn test_get_current_opc_with_no_opcs_returns_not_found() {
        let pool = setup();
        let result = get_current_opc(&pool);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_set_current_opc_with_invalid_id_returns_not_found() {
        let pool = setup();
        let result = set_current_opc(&pool, "does-not-exist");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ── export / import roundtrip ─────────────────────────────────────────────

    #[test]
    fn test_export_import_roundtrip() {
        let pool = setup();

        let original_id = create_opc(&pool, sample_config("exported")).expect("create");
        let original = get_opc(&pool, &original_id).expect("get original");

        // export
        let json = export_opc(&pool, &original_id).expect("export");
        assert!(json.contains("exported"));

        // import creates a brand-new record
        let imported_id = import_opc(&pool, &json).expect("import");
        assert_ne!(imported_id, original_id, "imported record must get a new ID");

        let imported = get_opc(&pool, &imported_id).expect("get imported");
        // The import deduplicates names when the original name already exists,
        // so we only verify that the imported name starts with the original.
        assert!(
            imported.name.starts_with(&original.name),
            "imported name '{}' should start with original name '{}'",
            imported.name,
            original.name
        );
        assert_eq!(imported.display_name, original.display_name);
        assert_eq!(imported.description, original.description);
        assert_eq!(imported.avatar_color, original.avatar_color);
        assert_eq!(imported.agent_count, original.agent_count);
        assert_eq!(imported.channel_count, original.channel_count);
        assert!((imported.message_growth - original.message_growth).abs() < f64::EPSILON);

        // timestamps are reset by create_opc
        assert!(imported.created_at > 0);
    }

    #[test]
    fn test_export_nonexistent_returns_not_found() {
        let pool = setup();
        let result = export_opc(&pool, "no-such-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_import_invalid_json_returns_serialization_error() {
        let pool = setup();
        let result = import_opc(&pool, "not valid json");
        assert!(matches!(result, Err(AppError::Serialization(_))));
    }

    // ── get_opc_stats ─────────────────────────────────────────────────────────

    #[test]
    fn test_get_opc_stats() {
        let pool = setup();
        let id = create_opc(&pool, sample_config("stats-test")).expect("create");
        let stats = get_opc_stats(&pool, &id).expect("get stats");
        assert_eq!(stats.agent_count, 2);
        assert_eq!(stats.channel_count, 1);
        assert_eq!(stats.message_count_today, 10);
        assert!((stats.message_growth - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_get_opc_stats_nonexistent_returns_not_found() {
        let pool = setup();
        let result = get_opc_stats(&pool, "ghost");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ── bool / is_active roundtrip ────────────────────────────────────────────

    #[test]
    fn test_bool_fields_persist_correctly() {
        let pool = setup();
        let mut cfg = sample_config("bool-test");
        cfg.is_active = true;
        cfg.is_running = true;

        let id = create_opc(&pool, cfg).expect("create");
        let fetched = get_opc(&pool, &id).expect("get");
        assert!(fetched.is_active);
        assert!(fetched.is_running);
    }
}
