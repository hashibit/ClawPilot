use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::tool::ToolInfo;
use crate::services::tool_service;

#[tauri::command]
pub fn get_tools(pool: State<'_, DbPool>) -> Result<Vec<ToolInfo>> {
    tool_service::get_tools(&pool)
}

#[tauri::command]
pub fn sync_tools_from_clawhub(pool: State<'_, DbPool>) -> Result<Vec<ToolInfo>> {
    tool_service::sync_tools_from_clawhub(&pool)
}
