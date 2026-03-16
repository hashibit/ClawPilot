use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::binding::BindingRule;
use crate::services::binding_service;

#[tauri::command]
pub fn get_bindings(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<BindingRule>> {
    binding_service::get_bindings(&pool, &opc_id)
}

#[tauri::command]
pub fn get_binding(pool: State<'_, DbPool>, id: String) -> Result<BindingRule> {
    binding_service::get_binding(&pool, &id)
}

#[tauri::command]
pub fn create_binding(pool: State<'_, DbPool>, binding: BindingRule) -> Result<String> {
    binding_service::create_binding(&pool, binding)
}

#[tauri::command]
pub fn update_binding(
    pool: State<'_, DbPool>,
    id: String,
    binding: BindingRule,
) -> Result<()> {
    binding_service::update_binding(&pool, &id, binding)
}

#[tauri::command]
pub fn delete_binding(pool: State<'_, DbPool>, id: String) -> Result<()> {
    binding_service::delete_binding(&pool, &id)
}

#[tauri::command]
pub fn toggle_binding(pool: State<'_, DbPool>, id: String, is_enabled: bool) -> Result<()> {
    binding_service::toggle_binding(&pool, &id, is_enabled)
}

/// Stub: returns empty list until Feishu API integration is implemented (Phase 5)
#[tauri::command]
pub fn get_feishu_channels(_pool: State<'_, DbPool>) -> Result<Vec<serde_json::Value>> {
    Ok(vec![])
}
