use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::agent::AgentConfig;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Map a rusqlite `Row` to an `AgentConfig`.
///
/// Column order must match the SELECT used in query functions.
fn row_to_agent(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentConfig> {
    let enabled_tools_raw: String = row.get(14)?;
    let disabled_tools_raw: String = row.get(15)?;
    let enabled_skills_raw: String = row.get(16)?;
    let guardrail_rules_raw: String = row.get(17)?;
    let reports_to_raw: String = row.get(18)?;
    let manages_raw: String = row.get(19)?;

    let is_default_i64: i64 = row.get(10)?;
    let (guardrail_allow, guardrail_deny) = AgentConfig::parse_guardrail(&guardrail_rules_raw);

    Ok(AgentConfig {
        id: row.get(0)?,
        opc_id: row.get(1)?,
        name: row.get(2)?,
        display_name: row.get(3)?,
        job_title: row.get(4)?,
        personality: row.get(5)?,
        description: row.get(6)?,
        initials: row.get(7)?,
        gradient_start: row.get(8)?,
        gradient_end: row.get(9)?,
        is_default: AgentConfig::i64_to_bool(is_default_i64),
        order_index: row.get(11)?,
        model_provider: row.get(12)?,
        model_name: row.get(13)?,
        enabled_tools: AgentConfig::json_to_vec(&enabled_tools_raw),
        disabled_tools: AgentConfig::json_to_vec(&disabled_tools_raw),
        enabled_skills: AgentConfig::json_to_vec(&enabled_skills_raw),
        guardrail_rules: guardrail_allow.clone(),
        guardrail_allow,
        guardrail_deny,
        reports_to: AgentConfig::json_to_vec(&reports_to_raw),
        manages: AgentConfig::json_to_vec(&manages_raw),
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
        model: row.get(22).ok().flatten(),
    })
}

const SELECT_AGENT_COLUMNS: &str = r#"
    id, opc_id, name, display_name,
    job_title, personality, description, initials,
    gradient_start, gradient_end, is_default, order_index,
    model_provider, model_name,
    COALESCE(enabled_tools, '[]'),
    COALESCE(disabled_tools, '[]'),
    COALESCE(enabled_skills, '[]'),
    COALESCE(guardrail_rules, '[]'),
    COALESCE(reports_to, '[]'),
    COALESCE(manages, '[]'),
    created_at, updated_at, model
"#;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Return all agents belonging to `opc_id`, ordered by `order_index` ascending.
pub fn get_agents(pool: &DbPool, opc_id: &str) -> Result<Vec<AgentConfig>> {
    let conn = pool.get()?;
    let sql = format!(
        "SELECT {} FROM agents WHERE opc_id = ?1 ORDER BY order_index ASC",
        SELECT_AGENT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let agents = stmt
        .query_map(rusqlite::params![opc_id], row_to_agent)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(agents)
}

/// Return a single agent by primary key.
pub fn get_agent(pool: &DbPool, id: &str) -> Result<AgentConfig> {
    let conn = pool.get()?;
    let sql = format!(
        "SELECT {} FROM agents WHERE id = ?1",
        SELECT_AGENT_COLUMNS
    );
    let agent = conn
        .query_row(&sql, rusqlite::params![id], row_to_agent)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("agent '{}' not found", id))
            }
            other => AppError::Database(other),
        })?;
    Ok(agent)
}

/// Insert a new agent and return its `id`.
pub fn create_agent(pool: &DbPool, config: AgentConfig) -> Result<String> {
    let conn = pool.get()?;
    conn.execute(
        r#"INSERT INTO agents (
            id, opc_id, name, display_name,
            job_title, personality, description, initials,
            gradient_start, gradient_end, is_default, order_index,
            model_provider, model_name, model,
            enabled_tools, disabled_tools, enabled_skills,
            guardrail_rules, reports_to, manages,
            created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4,
            ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12,
            ?13, ?14, ?15,
            ?16, ?17, ?18,
            ?19, ?20, ?21,
            ?22, ?23
        )"#,
        rusqlite::params![
            config.id,
            config.opc_id,
            config.name,
            config.display_name,
            config.job_title,
            config.personality,
            config.description,
            config.initials,
            config.gradient_start,
            config.gradient_end,
            AgentConfig::bool_to_i64(config.is_default),
            config.order_index,
            config.model_provider,
            config.model_name,
            config.model,
            AgentConfig::vec_to_json(&config.enabled_tools),
            AgentConfig::vec_to_json(&config.disabled_tools),
            AgentConfig::vec_to_json(&config.enabled_skills),
            AgentConfig::serialize_guardrail(&config.guardrail_allow, &config.guardrail_deny),
            AgentConfig::vec_to_json(&config.reports_to),
            AgentConfig::vec_to_json(&config.manages),
            config.created_at,
            config.updated_at,
        ],
    )?;
    Ok(config.id)
}

/// Update an existing agent identified by `id`.
pub fn update_agent(pool: &DbPool, id: &str, config: AgentConfig) -> Result<()> {
    let conn = pool.get()?;
    let rows = conn.execute(
        r#"UPDATE agents SET
            opc_id = ?1,
            name = ?2,
            display_name = ?3,
            job_title = ?4,
            personality = ?5,
            description = ?6,
            initials = ?7,
            gradient_start = ?8,
            gradient_end = ?9,
            is_default = ?10,
            order_index = ?11,
            model_provider = ?12,
            model_name = ?13,
            model = ?14,
            enabled_tools = ?15,
            disabled_tools = ?16,
            enabled_skills = ?17,
            guardrail_rules = ?18,
            reports_to = ?19,
            manages = ?20,
            updated_at = ?21
        WHERE id = ?22"#,
        rusqlite::params![
            config.opc_id,
            config.name,
            config.display_name,
            config.job_title,
            config.personality,
            config.description,
            config.initials,
            config.gradient_start,
            config.gradient_end,
            AgentConfig::bool_to_i64(config.is_default),
            config.order_index,
            config.model_provider,
            config.model_name,
            config.model,
            AgentConfig::vec_to_json(&config.enabled_tools),
            AgentConfig::vec_to_json(&config.disabled_tools),
            AgentConfig::vec_to_json(&config.enabled_skills),
            AgentConfig::serialize_guardrail(&config.guardrail_allow, &config.guardrail_deny),
            AgentConfig::vec_to_json(&config.reports_to),
            AgentConfig::vec_to_json(&config.manages),
            config.updated_at,
            id,
        ],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("agent '{}' not found", id)));
    }
    Ok(())
}

/// Delete an agent by primary key.
pub fn delete_agent(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let rows = conn.execute(
        "DELETE FROM agents WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("agent '{}' not found", id)));
    }
    Ok(())
}

/// Reorder agents within `opc_id` by updating each agent's `order_index`
/// to match its position in `agent_ids`.
///
/// All updates are executed inside a single transaction so the reordering
/// is atomic — either every `order_index` is updated or none are.
pub fn reorder_agents(pool: &DbPool, opc_id: &str, agent_ids: Vec<String>) -> Result<()> {
    let conn = pool.get()?;
    // `unchecked_transaction` is safe here because we hold the mutex guard
    // exclusively, so no other thread can concurrently access the connection.
    let tx = conn.unchecked_transaction()?;
    for (idx, agent_id) in agent_ids.iter().enumerate() {
        tx.execute(
            "UPDATE agents SET order_index = ?1 WHERE id = ?2 AND opc_id = ?3",
            rusqlite::params![idx as i32, agent_id, opc_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Set a default agent for an OPC. Clears the default flag from all other agents
/// in the same OPC and sets it on the specified agent.
pub fn set_default_agent(pool: &DbPool, opc_id: &str, agent_id: &str) -> Result<()> {
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;

    // Clear default from all agents in this OPC
    tx.execute(
        "UPDATE agents SET is_default = 0 WHERE opc_id = ?1",
        rusqlite::params![opc_id],
    )?;

    // Set default on the specified agent
    let rows = tx.execute(
        "UPDATE agents SET is_default = 1 WHERE id = ?1 AND opc_id = ?2",
        rusqlite::params![agent_id, opc_id],
    )?;

    tx.commit()?;

    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "agent '{}' not found in opc '{}'",
            agent_id, opc_id
        )));
    }

    Ok(())
}

/// Agent document with type and content
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentDocument {
    pub document_type: String,
    pub content: String,
}

/// Get all documents for an agent
pub fn get_agent_documents(pool: &DbPool, agent_id: &str) -> Result<Vec<AgentDocument>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT document_type, content FROM agent_documents WHERE agent_id = ?1"
    )?;
    let documents = stmt
        .query_map(rusqlite::params![agent_id], |row| {
            Ok(AgentDocument {
                document_type: row.get(0)?,
                content: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(documents)
}

/// Create multiple agents in a single transaction.
/// `documents` maps agent_id → (doc_type → content).
pub fn batch_create_agents(
    pool: &DbPool,
    agents: Vec<AgentConfig>,
    documents: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
) -> Result<Vec<String>> {
    if agents.is_empty() {
        return Ok(vec![]);
    }
    let conn = pool.get()?;
    let tx = conn.unchecked_transaction()?;

    let mut ids = Vec::with_capacity(agents.len());
    for (idx, config) in agents.iter().enumerate() {
        tx.execute(
            r#"INSERT INTO agents (
                id, opc_id, name, display_name,
                job_title, personality, description, initials,
                gradient_start, gradient_end, is_default, order_index,
                model_provider, model_name, model,
                enabled_tools, disabled_tools, enabled_skills,
                guardrail_rules, reports_to, manages,
                created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4,
                ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12,
                ?13, ?14, ?15,
                ?16, ?17, ?18,
                ?19, ?20, ?21,
                ?22, ?23
            )"#,
            rusqlite::params![
                config.id,
                config.opc_id,
                config.name,
                config.display_name,
                config.job_title,
                config.personality,
                config.description,
                config.initials,
                config.gradient_start,
                config.gradient_end,
                AgentConfig::bool_to_i64(config.is_default),
                if config.order_index == 0 { idx as i32 } else { config.order_index },
                config.model_provider,
                config.model_name,
                config.model,
                AgentConfig::vec_to_json(&config.enabled_tools),
                AgentConfig::vec_to_json(&config.disabled_tools),
                AgentConfig::vec_to_json(&config.enabled_skills),
                AgentConfig::serialize_guardrail(&config.guardrail_allow, &config.guardrail_deny),
                AgentConfig::vec_to_json(&config.reports_to),
                AgentConfig::vec_to_json(&config.manages),
                config.created_at,
                config.updated_at,
            ],
        )?;

        if let Some(agent_docs) = documents.get(&config.id) {
            for (doc_type, content) in agent_docs {
                if !content.trim().is_empty() {
                    tx.execute(
                        r#"INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content)
                           VALUES (?1, ?2, ?3)"#,
                        rusqlite::params![config.id, doc_type, content],
                    )?;
                }
            }
        }

        ids.push(config.id.clone());
    }

    tx.commit()?;
    Ok(ids)
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent documents
// ─────────────────────────────────────────────────────────────────────────────

/// Return the content of an agent document. Returns an empty string when the
/// row does not exist (unlike other getters which return `NotFound`).
pub fn get_agent_document(pool: &DbPool, agent_id: &str, doc_type: &str) -> Result<String> {
    let conn = pool.get()?;
    let result: rusqlite::Result<String> = conn.query_row(
        "SELECT content FROM agent_documents WHERE agent_id = ?1 AND document_type = ?2",
        rusqlite::params![agent_id, doc_type],
        |row| row.get(0),
    );
    match result {
        Ok(content) => Ok(content),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Insert or replace an agent document.
pub fn upsert_agent_document(
    pool: &DbPool,
    agent_id: &str,
    doc_type: &str,
    content: &str,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        r#"INSERT OR REPLACE INTO agent_documents (agent_id, document_type, content)
           VALUES (?1, ?2, ?3)"#,
        rusqlite::params![agent_id, doc_type, content],
    )?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::migrations::run_migrations;
    use crate::models::agent::AgentConfig;
    use rusqlite::Connection;

    fn in_memory_pool() -> DbPool {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )
        .expect("configure pragmas");
        let pool = DbPool::new_in_memory_for_test(conn);
        run_migrations(&pool).expect("run migrations");
        pool
    }

    /// Insert a minimal `opc_config` row so FK constraints are satisfied.
    fn insert_opc(pool: &DbPool, opc_id: &str) {
        let conn = pool.get().expect("get conn");
        let now = 1_700_000_000_i64;
        conn.execute(
            r#"INSERT INTO opc_config (id, name, display_name, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5)"#,
            rusqlite::params![opc_id, opc_id, opc_id, now, now],
        )
        .expect("insert opc_config");
    }

    fn make_agent(id: &str, opc_id: &str, order_index: i32) -> AgentConfig {
        AgentConfig {
            id: id.to_string(),
            opc_id: opc_id.to_string(),
            name: format!("agent_{}", id),
            display_name: format!("Agent {}", id),
            job_title: Some("Engineer".to_string()),
            personality: None,
            description: None,
            initials: None,
            gradient_start: None,
            gradient_end: None,
            is_default: false,
            order_index,
            model_provider: Some("openai".to_string()),
            model_name: Some("gpt-4".to_string()),
            model: None,
            enabled_tools: vec!["tool-a".to_string()],
            disabled_tools: vec![],
            enabled_skills: vec!["skill-x".to_string()],
            guardrail_rules: vec![],
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 1_700_000_000,
            updated_at: 1_700_000_000,
        }
    }

    // ─── CRUD lifecycle ───────────────────────────────────────────────────

    #[test]
    fn test_crud_lifecycle() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");

        let agent = make_agent("agent-1", "opc-1", 0);
        let returned_id = create_agent(&pool, agent.clone()).expect("create");
        assert_eq!(returned_id, "agent-1");

        // get_agent
        let fetched = get_agent(&pool, "agent-1").expect("get");
        assert_eq!(fetched.id, "agent-1");
        assert_eq!(fetched.name, "agent_agent-1");
        assert_eq!(fetched.enabled_tools, vec!["tool-a"]);

        // update
        let mut updated = agent.clone();
        updated.display_name = "Updated Agent".to_string();
        updated.enabled_tools = vec!["tool-b".to_string(), "tool-c".to_string()];
        updated.updated_at = 1_700_001_000;
        update_agent(&pool, "agent-1", updated).expect("update");

        let after_update = get_agent(&pool, "agent-1").expect("get after update");
        assert_eq!(after_update.display_name, "Updated Agent");
        assert_eq!(after_update.enabled_tools, vec!["tool-b", "tool-c"]);

        // delete
        delete_agent(&pool, "agent-1").expect("delete");
        let result = get_agent(&pool, "agent-1");
        assert!(result.is_err(), "should be NotFound after delete");
    }

    #[test]
    fn test_get_agents_returns_sorted_by_order_index() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");

        create_agent(&pool, make_agent("a3", "opc-1", 2)).expect("create a3");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create a1");
        create_agent(&pool, make_agent("a2", "opc-1", 1)).expect("create a2");

        let agents = get_agents(&pool, "opc-1").expect("get_agents");
        assert_eq!(agents.len(), 3);
        assert_eq!(agents[0].id, "a1");
        assert_eq!(agents[1].id, "a2");
        assert_eq!(agents[2].id, "a3");
    }

    #[test]
    fn test_get_agents_empty_opc() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-empty");
        let agents = get_agents(&pool, "opc-empty").expect("get_agents");
        assert!(agents.is_empty());
    }

    #[test]
    fn test_update_nonexistent_returns_not_found() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        let agent = make_agent("ghost", "opc-1", 0);
        let result = update_agent(&pool, "ghost", agent);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_nonexistent_returns_not_found() {
        let pool = in_memory_pool();
        let result = delete_agent(&pool, "ghost");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── reorder_agents ───────────────────────────────────────────────────

    #[test]
    fn test_reorder_agents() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");

        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("a1");
        create_agent(&pool, make_agent("a2", "opc-1", 1)).expect("a2");
        create_agent(&pool, make_agent("a3", "opc-1", 2)).expect("a3");

        // Reverse the order
        reorder_agents(
            &pool,
            "opc-1",
            vec!["a3".to_string(), "a2".to_string(), "a1".to_string()],
        )
        .expect("reorder");

        let agents = get_agents(&pool, "opc-1").expect("get after reorder");
        assert_eq!(agents[0].id, "a3");
        assert_eq!(agents[1].id, "a2");
        assert_eq!(agents[2].id, "a1");
    }

    #[test]
    fn test_reorder_empty_list_is_noop() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create");

        reorder_agents(&pool, "opc-1", vec![]).expect("empty reorder should be ok");

        let agents = get_agents(&pool, "opc-1").expect("get");
        assert_eq!(agents[0].order_index, 0);
    }

    // ─── get / upsert document ────────────────────────────────────────────

    #[test]
    fn test_get_document_not_found_returns_empty_string() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create");

        let content = get_agent_document(&pool, "a1", "SOUL").expect("get doc");
        assert_eq!(content, "");
    }

    #[test]
    fn test_upsert_and_get_document() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create");

        upsert_agent_document(&pool, "a1", "SOUL", "You are a helpful assistant.")
            .expect("upsert");
        let content = get_agent_document(&pool, "a1", "SOUL").expect("get");
        assert_eq!(content, "You are a helpful assistant.");
    }

    #[test]
    fn test_upsert_document_replaces_existing() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create");

        upsert_agent_document(&pool, "a1", "IDENTITY", "first").expect("upsert 1");
        upsert_agent_document(&pool, "a1", "IDENTITY", "second").expect("upsert 2");
        let content = get_agent_document(&pool, "a1", "IDENTITY").expect("get");
        assert_eq!(content, "second");
    }

    #[test]
    fn test_multiple_document_types() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create");

        upsert_agent_document(&pool, "a1", "SOUL", "soul content").expect("upsert soul");
        upsert_agent_document(&pool, "a1", "MEMORY", "memory content").expect("upsert memory");

        assert_eq!(
            get_agent_document(&pool, "a1", "SOUL").unwrap(),
            "soul content"
        );
        assert_eq!(
            get_agent_document(&pool, "a1", "MEMORY").unwrap(),
            "memory content"
        );
        assert_eq!(
            get_agent_document(&pool, "a1", "TOOLS").unwrap(),
            ""
        );
    }

    // ─── CASCADE delete: documents removed with agent ─────────────────────

    #[test]
    fn test_delete_agent_cascades_to_documents() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        create_agent(&pool, make_agent("a1", "opc-1", 0)).expect("create agent");

        upsert_agent_document(&pool, "a1", "SOUL", "soul").expect("upsert soul");
        upsert_agent_document(&pool, "a1", "IDENTITY", "identity").expect("upsert identity");

        // Verify documents exist before deletion
        assert_eq!(get_agent_document(&pool, "a1", "SOUL").unwrap(), "soul");

        // Delete the agent — CASCADE should remove its documents
        delete_agent(&pool, "a1").expect("delete agent");

        // Documents should be gone; querying returns empty string (not error)
        let content = get_agent_document(&pool, "a1", "SOUL").unwrap();
        assert_eq!(content, "", "document should be gone after cascade delete");

        let identity = get_agent_document(&pool, "a1", "IDENTITY").unwrap();
        assert_eq!(identity, "");
    }

    // ─── FK violation: upsert document for non-existent agent ────────────

    #[test]
    fn test_upsert_document_for_nonexistent_agent_fails() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");
        // Do NOT create any agent — FK should reject the insert
        let result = upsert_agent_document(&pool, "ghost-agent", "SOUL", "content");
        assert!(result.is_err(), "should fail with FK constraint violation");
    }

    // ─── reorder cross-OPC isolation ─────────────────────────────────────

    #[test]
    fn test_reorder_does_not_affect_other_opc() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-a");
        insert_opc(&pool, "opc-b");

        create_agent(&pool, make_agent("a1", "opc-a", 0)).expect("a1");
        create_agent(&pool, make_agent("a2", "opc-a", 1)).expect("a2");
        create_agent(&pool, make_agent("b1", "opc-b", 0)).expect("b1");
        create_agent(&pool, make_agent("b2", "opc-b", 1)).expect("b2");

        // Reverse order within opc-a only
        reorder_agents(&pool, "opc-a", vec!["a2".to_string(), "a1".to_string()])
            .expect("reorder opc-a");

        let agents_a = get_agents(&pool, "opc-a").expect("get opc-a");
        let agents_b = get_agents(&pool, "opc-b").expect("get opc-b");

        // opc-a order reversed
        assert_eq!(agents_a[0].id, "a2");
        assert_eq!(agents_a[1].id, "a1");

        // opc-b order unchanged
        assert_eq!(agents_b[0].id, "b1");
        assert_eq!(agents_b[1].id, "b2");
    }

    // ─── reorder atomicity: verify all order_index values updated ────────

    #[test]
    fn test_reorder_updates_all_indices() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");

        create_agent(&pool, make_agent("x1", "opc-1", 10)).expect("x1");
        create_agent(&pool, make_agent("x2", "opc-1", 20)).expect("x2");
        create_agent(&pool, make_agent("x3", "opc-1", 30)).expect("x3");

        reorder_agents(
            &pool,
            "opc-1",
            vec!["x3".to_string(), "x1".to_string(), "x2".to_string()],
        )
        .expect("reorder");

        let agents = get_agents(&pool, "opc-1").expect("get");
        // Should be ordered 0,1,2 after reorder
        assert_eq!(agents[0].id, "x3");
        assert_eq!(agents[0].order_index, 0);
        assert_eq!(agents[1].id, "x1");
        assert_eq!(agents[1].order_index, 1);
        assert_eq!(agents[2].id, "x2");
        assert_eq!(agents[2].order_index, 2);
    }

    // ─── Vec<String> JSON roundtrip through DB ────────────────────────────

    #[test]
    fn test_vec_fields_persist_and_roundtrip() {
        let pool = in_memory_pool();
        insert_opc(&pool, "opc-1");

        let mut agent = make_agent("a1", "opc-1", 0);
        agent.enabled_tools = vec!["t1".to_string(), "t2".to_string(), "t3".to_string()];
        agent.disabled_tools = vec!["d1".to_string()];
        agent.guardrail_rules = vec!["rule-a".to_string(), "rule-b".to_string()];
        agent.reports_to = vec!["boss".to_string()];
        agent.manages = vec!["sub1".to_string(), "sub2".to_string()];

        create_agent(&pool, agent.clone()).expect("create");
        let fetched = get_agent(&pool, "a1").expect("get");

        assert_eq!(fetched.enabled_tools, agent.enabled_tools);
        assert_eq!(fetched.disabled_tools, agent.disabled_tools);
        assert_eq!(fetched.guardrail_rules, agent.guardrail_rules);
        assert_eq!(fetched.reports_to, agent.reports_to);
        assert_eq!(fetched.manages, agent.manages);
    }
}
