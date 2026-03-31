use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::tool::ToolInfo;
use crate::services::tool_service::{self, LocalToolInput};

#[tauri::command]
pub fn get_tools(pool: State<'_, DbPool>) -> Result<Vec<ToolInfo>> {
    tool_service::get_tools(&pool)
}

#[tauri::command]
pub fn sync_tools_from_clawhub(pool: State<'_, DbPool>) -> Result<Vec<ToolInfo>> {
    tool_service::sync_tools_from_clawhub(&pool)
}

#[tauri::command]
pub fn create_tool(pool: State<'_, DbPool>, tool: LocalToolInput) -> Result<i64> {
    tool_service::create_tool(&pool, tool)
}

#[tauri::command]
pub fn delete_tool(pool: State<'_, DbPool>, id: String) -> Result<()> {
    tool_service::delete_tool(&pool, id)
}
