use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::agent::AgentConfig;
use crate::services::agent_service;

#[tauri::command]
pub fn get_agents(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<AgentConfig>> {
    agent_service::get_agents(&pool, &opc_id)
}

#[tauri::command]
pub fn get_agent(pool: State<'_, DbPool>, id: String) -> Result<AgentConfig> {
    agent_service::get_agent(&pool, &id)
}

#[tauri::command]
pub fn create_agent(pool: State<'_, DbPool>, config: AgentConfig) -> Result<String> {
    agent_service::create_agent(&pool, config)
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
