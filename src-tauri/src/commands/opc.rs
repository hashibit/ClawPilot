use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::opc::{OpcConfig, OpcStats};
use crate::services::opc_service;

#[tauri::command]
pub fn get_all_opcs(pool: State<'_, DbPool>) -> Result<Vec<OpcConfig>> {
    opc_service::get_all_opcs(&pool)
}

#[tauri::command]
pub fn get_opc(pool: State<'_, DbPool>, id: String) -> Result<OpcConfig> {
    opc_service::get_opc(&pool, &id)
}

#[tauri::command]
pub fn create_opc(pool: State<'_, DbPool>, config: OpcConfig) -> Result<String> {
    opc_service::create_opc(&pool, config)
}

#[tauri::command]
pub fn update_opc(pool: State<'_, DbPool>, id: String, config: OpcConfig) -> Result<()> {
    opc_service::update_opc(&pool, &id, config)
}

#[tauri::command]
pub fn delete_opc(pool: State<'_, DbPool>, id: String) -> Result<()> {
    opc_service::delete_opc(&pool, &id)
}

#[tauri::command]
pub fn set_current_opc(pool: State<'_, DbPool>, id: String) -> Result<()> {
    opc_service::set_current_opc(&pool, &id)
}

#[tauri::command]
pub fn get_current_opc(pool: State<'_, DbPool>) -> Result<OpcConfig> {
    opc_service::get_current_opc(&pool)
}

#[tauri::command]
pub fn get_opc_stats(pool: State<'_, DbPool>, opc_id: String) -> Result<OpcStats> {
    opc_service::get_opc_stats(&pool, &opc_id)
}

#[tauri::command]
pub fn update_opc_stats(pool: State<'_, DbPool>, id: String) -> Result<()> {
    opc_service::update_opc_stats(&pool, &id)
}

#[tauri::command]
pub fn export_opc(pool: State<'_, DbPool>, opc_id: String) -> Result<String> {
    opc_service::export_opc(&pool, &opc_id)
}

#[tauri::command]
pub fn import_opc(pool: State<'_, DbPool>, json: String) -> Result<String> {
    opc_service::import_opc(&pool, &json)
}
