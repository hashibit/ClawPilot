use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::services::log_service::{self, LogEntry};

#[tauri::command]
pub fn get_logs(
    pool: State<'_, DbPool>,
    level: Option<String>,
    component: Option<String>,
    limit: i64,
) -> Result<Vec<LogEntry>> {
    log_service::get_logs(
        &pool,
        level.as_deref(),
        component.as_deref(),
        limit,
    )
}

#[tauri::command]
pub fn write_log(
    pool: State<'_, DbPool>,
    level: String,
    component: Option<String>,
    message: String,
    agent_id: Option<String>,
    channel: Option<String>,
) -> Result<i64> {
    log_service::write_log(
        &pool,
        &level,
        component.as_deref(),
        &message,
        agent_id.as_deref(),
        channel.as_deref(),
    )
}
