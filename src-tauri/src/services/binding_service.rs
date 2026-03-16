use std::time::{SystemTime, UNIX_EPOCH};

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::binding::{BindingChannelType, BindingRule, TriggerMode};

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Return all binding rules that belong to a given OPC.
pub fn get_bindings(pool: &DbPool, opc_id: &str) -> Result<Vec<BindingRule>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, opc_id, channel_id, channel_name, channel_type,
                agent_id, agent_name, trigger_mode, is_enabled,
                created_at, updated_at
         FROM bindings
         WHERE opc_id = ?1
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map([opc_id], |row| {
        let channel_type_str: String = row.get(4)?;
        let trigger_mode_str: String = row.get(7)?;
        let is_enabled_i64: i64 = row.get(8)?;

        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            channel_type_str,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            trigger_mode_str,
            is_enabled_i64,
            row.get::<_, i64>(9)?,
            row.get::<_, i64>(10)?,
        ))
    })?;

    let mut bindings = Vec::new();
    for row in rows {
        let (id, opc_id, channel_id, channel_name, channel_type_str,
             agent_id, agent_name, trigger_mode_str, is_enabled_i64,
             created_at, updated_at) = row?;

        let channel_type = BindingChannelType::from_str(&channel_type_str)
            .ok_or_else(|| AppError::Internal(format!("Unknown channel_type: {channel_type_str}")))?;
        let trigger_mode = TriggerMode::from_str(&trigger_mode_str)
            .ok_or_else(|| AppError::Internal(format!("Unknown trigger_mode: {trigger_mode_str}")))?;

        bindings.push(BindingRule {
            id,
            opc_id,
            channel_id,
            channel_name,
            channel_type,
            agent_id,
            agent_name,
            trigger_mode,
            is_enabled: BindingRule::i64_to_bool(is_enabled_i64),
            created_at,
            updated_at,
        });
    }

    Ok(bindings)
}

/// Return a single binding rule by its primary key.
pub fn get_binding(pool: &DbPool, id: &str) -> Result<BindingRule> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, opc_id, channel_id, channel_name, channel_type,
                agent_id, agent_name, trigger_mode, is_enabled,
                created_at, updated_at
         FROM bindings
         WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
            ))
        },
    );

    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("Binding '{id}' not found")))
        }
        Err(e) => Err(AppError::Database(e)),
        Ok((id, opc_id, channel_id, channel_name, channel_type_str,
            agent_id, agent_name, trigger_mode_str, is_enabled_i64,
            created_at, updated_at)) => {
            let channel_type = BindingChannelType::from_str(&channel_type_str)
                .ok_or_else(|| AppError::Internal(format!("Unknown channel_type: {channel_type_str}")))?;
            let trigger_mode = TriggerMode::from_str(&trigger_mode_str)
                .ok_or_else(|| AppError::Internal(format!("Unknown trigger_mode: {trigger_mode_str}")))?;

            Ok(BindingRule {
                id,
                opc_id,
                channel_id,
                channel_name,
                channel_type,
                agent_id,
                agent_name,
                trigger_mode,
                is_enabled: BindingRule::i64_to_bool(is_enabled_i64),
                created_at,
                updated_at,
            })
        }
    }
}

/// Insert a new binding rule and return its id.
pub fn create_binding(pool: &DbPool, binding: BindingRule) -> Result<String> {
    let conn = pool.get()?;
    let now = now_unix();
    let id = if binding.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        binding.id.clone()
    };

    conn.execute(
        "INSERT INTO bindings
             (id, opc_id, channel_id, channel_name, channel_type,
              agent_id, agent_name, trigger_mode, is_enabled,
              created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            binding.opc_id,
            binding.channel_id,
            binding.channel_name,
            binding.channel_type.as_str(),
            binding.agent_id,
            binding.agent_name,
            binding.trigger_mode.as_str(),
            BindingRule::bool_to_i64(binding.is_enabled),
            now,
            now,
        ],
    )?;

    Ok(id)
}

/// Replace all mutable fields of an existing binding rule.
pub fn update_binding(pool: &DbPool, id: &str, binding: BindingRule) -> Result<()> {
    let conn = pool.get()?;
    let now = now_unix();

    let rows = conn.execute(
        "UPDATE bindings
         SET channel_id   = ?1,
             channel_name = ?2,
             channel_type = ?3,
             agent_id     = ?4,
             agent_name   = ?5,
             trigger_mode = ?6,
             is_enabled   = ?7,
             updated_at   = ?8
         WHERE id = ?9",
        rusqlite::params![
            binding.channel_id,
            binding.channel_name,
            binding.channel_type.as_str(),
            binding.agent_id,
            binding.agent_name,
            binding.trigger_mode.as_str(),
            BindingRule::bool_to_i64(binding.is_enabled),
            now,
            id,
        ],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound(format!("Binding '{id}' not found")));
    }
    Ok(())
}

/// Delete a binding rule by its primary key.
pub fn delete_binding(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let rows = conn.execute("DELETE FROM bindings WHERE id = ?1", [id])?;

    if rows == 0 {
        return Err(AppError::NotFound(format!("Binding '{id}' not found")));
    }
    Ok(())
}

/// Enable or disable a binding rule without touching other fields.
pub fn toggle_binding(pool: &DbPool, id: &str, is_enabled: bool) -> Result<()> {
    let conn = pool.get()?;
    let now = now_unix();

    let rows = conn.execute(
        "UPDATE bindings SET is_enabled = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![BindingRule::bool_to_i64(is_enabled), now, id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound(format!("Binding '{id}' not found")));
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::pool::DbPool;
    use crate::models::binding::{BindingChannelType, TriggerMode};
    use rusqlite::Connection;

    fn setup_pool() -> DbPool {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             CREATE TABLE bindings (
                 id           TEXT PRIMARY KEY,
                 opc_id       TEXT NOT NULL,
                 channel_id   TEXT NOT NULL,
                 channel_name TEXT NOT NULL,
                 channel_type TEXT NOT NULL,
                 agent_id     TEXT NOT NULL,
                 agent_name   TEXT NOT NULL,
                 trigger_mode TEXT NOT NULL,
                 is_enabled   INTEGER DEFAULT 1,
                 created_at   INTEGER NOT NULL,
                 updated_at   INTEGER NOT NULL
             );",
        )
        .expect("create table");
        DbPool::new_in_memory_for_test(conn)
    }

    fn sample_binding(id: &str) -> BindingRule {
        BindingRule {
            id: id.to_string(),
            opc_id: "opc-1".to_string(),
            channel_id: "ch-1".to_string(),
            channel_name: "Engineering".to_string(),
            channel_type: BindingChannelType::Group,
            agent_id: "agent-1".to_string(),
            agent_name: "Alice".to_string(),
            trigger_mode: TriggerMode::Mention,
            is_enabled: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn test_create_and_get_binding() {
        let pool = setup_pool();
        let binding = sample_binding("b-1");

        let returned_id = create_binding(&pool, binding).expect("create");
        assert_eq!(returned_id, "b-1");

        let fetched = get_binding(&pool, "b-1").expect("get");
        assert_eq!(fetched.id, "b-1");
        assert_eq!(fetched.opc_id, "opc-1");
        assert_eq!(fetched.channel_type, BindingChannelType::Group);
        assert_eq!(fetched.trigger_mode, TriggerMode::Mention);
        assert!(fetched.is_enabled);
    }

    #[test]
    fn test_get_bindings_filters_by_opc() {
        let pool = setup_pool();
        create_binding(&pool, sample_binding("b-1")).unwrap();

        let other = BindingRule {
            id: "b-2".to_string(),
            opc_id: "opc-other".to_string(),
            ..sample_binding("b-2")
        };
        create_binding(&pool, other).unwrap();

        let results = get_bindings(&pool, "opc-1").expect("get_bindings");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "b-1");
    }

    #[test]
    fn test_update_binding() {
        let pool = setup_pool();
        create_binding(&pool, sample_binding("b-1")).unwrap();

        let updated = BindingRule {
            channel_name: "Design".to_string(),
            trigger_mode: TriggerMode::All,
            ..sample_binding("b-1")
        };
        update_binding(&pool, "b-1", updated).expect("update");

        let fetched = get_binding(&pool, "b-1").expect("get after update");
        assert_eq!(fetched.channel_name, "Design");
        assert_eq!(fetched.trigger_mode, TriggerMode::All);
    }

    #[test]
    fn test_delete_binding() {
        let pool = setup_pool();
        create_binding(&pool, sample_binding("b-1")).unwrap();

        delete_binding(&pool, "b-1").expect("delete");

        let err = get_binding(&pool, "b-1").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_toggle_binding() {
        let pool = setup_pool();
        create_binding(&pool, sample_binding("b-1")).unwrap();

        toggle_binding(&pool, "b-1", false).expect("toggle off");
        let fetched = get_binding(&pool, "b-1").expect("get after toggle");
        assert!(!fetched.is_enabled);

        toggle_binding(&pool, "b-1", true).expect("toggle on");
        let fetched = get_binding(&pool, "b-1").expect("get after re-toggle");
        assert!(fetched.is_enabled);
    }

    #[test]
    fn test_update_nonexistent_returns_not_found() {
        let pool = setup_pool();
        let err = update_binding(&pool, "ghost", sample_binding("ghost")).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_delete_nonexistent_returns_not_found() {
        let pool = setup_pool();
        let err = delete_binding(&pool, "ghost").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_toggle_nonexistent_returns_not_found() {
        let pool = setup_pool();
        let err = toggle_binding(&pool, "ghost", true).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
