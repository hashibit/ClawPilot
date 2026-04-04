use std::collections::HashMap;
use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::agent::AgentConfig;
use crate::services::agent_service;
pub use agent_service::AgentDocument;

#[tauri::command]
pub fn get_agents(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<AgentConfig>> {
    agent_service::get_agents(&pool, &opc_id)
}

#[tauri::command]
pub fn get_agent(pool: State<'_, DbPool>, id: String) -> Result<AgentConfig> {
    agent_service::get_agent(&pool, &id)
}

#[tauri::command]
pub fn create_agent(
    pool: State<'_, DbPool>,
    config: AgentConfig,
    documents: Option<HashMap<String, String>>,
) -> Result<String> {
    let id = agent_service::create_agent(&pool, config.clone())?;
    if let Some(docs) = documents {
        for (doc_type, content) in docs {
            if !content.trim().is_empty() {
                agent_service::upsert_agent_document(&pool, &id, &doc_type, &content)?;
            }
        }
    }
    Ok(id)
}

/// Batch-create multiple agents in a single transaction.
/// `agents`: list of AgentConfig
/// `documents`: map of agent_id → (doc_type → content)
#[tauri::command]
pub fn batch_create_agents(
    pool: State<'_, DbPool>,
    agents: Vec<AgentConfig>,
    documents: Option<HashMap<String, HashMap<String, String>>>,
) -> Result<Vec<String>> {
    agent_service::batch_create_agents(&pool, agents, documents.unwrap_or_default())
}

#[tauri::command]
pub fn update_agent(pool: State<'_, DbPool>, id: String, config: AgentConfig) -> Result<()> {
    agent_service::update_agent(&pool, &id, config)
}

#[tauri::command]
pub fn delete_agent(pool: State<'_, DbPool>, id: String) -> Result<()> {
    agent_service::delete_agent(&pool, &id)
}

#[tauri::command]
pub fn reorder_agents(
    pool: State<'_, DbPool>,
    opc_id: String,
    agent_ids: Vec<String>,
) -> Result<()> {
    agent_service::reorder_agents(&pool, &opc_id, agent_ids)
}

#[tauri::command]
pub fn get_agent_document(
    pool: State<'_, DbPool>,
    agent_id: String,
    doc_type: String,
) -> Result<String> {
    agent_service::get_agent_document(&pool, &agent_id, &doc_type)
}

#[tauri::command]
pub fn update_agent_document(
    pool: State<'_, DbPool>,
    agent_id: String,
    doc_type: String,
    content: String,
) -> Result<()> {
    agent_service::upsert_agent_document(&pool, &agent_id, &doc_type, &content)
}

#[tauri::command]
pub fn set_default_agent(
    pool: State<'_, DbPool>,
    opc_id: String,
    agent_id: String,
) -> Result<()> {
    agent_service::set_default_agent(&pool, &opc_id, &agent_id)
}

/// Designate an agent as the OPC leader (is_default=1). Alias for set_default_agent.
#[tauri::command]
pub fn set_leader(
    pool: State<'_, DbPool>,
    opc_id: String,
    agent_id: String,
) -> Result<()> {
    agent_service::set_default_agent(&pool, &opc_id, &agent_id)
}

/// Get all documents for an agent
#[tauri::command]
pub fn get_agent_documents(pool: State<'_, DbPool>, agent_id: String) -> Result<Vec<AgentDocument>> {
    agent_service::get_agent_documents(&pool, &agent_id)
}
