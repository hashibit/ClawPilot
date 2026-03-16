use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::services::deployment_service::{self, DeploymentTask};

#[tauri::command]
pub fn start_deployment(pool: State<'_, DbPool>, opc_name: String) -> Result<String> {
    deployment_service::start_deployment(&pool, &opc_name)
}

#[tauri::command]
pub fn get_deployment_status(pool: State<'_, DbPool>, task_id: String) -> Result<DeploymentTask> {
    deployment_service::get_deployment(&pool, &task_id)
}

#[tauri::command]
pub fn cancel_deployment(pool: State<'_, DbPool>, task_id: String) -> Result<()> {
    deployment_service::cancel_deployment(&pool, &task_id)
}

#[tauri::command]
pub fn get_recent_deployments(
    pool: State<'_, DbPool>,
    opc_name: String,
    limit: i64,
) -> Result<Vec<DeploymentTask>> {
    deployment_service::get_recent_deployments(&pool, &opc_name, limit)
}
