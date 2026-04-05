use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::services::deployment_service::{self, DeploymentTask};

#[tauri::command]
pub fn start_deployment(
    pool: State<'_, DbPool>,
    opc_id: String,
    office_id: String,
) -> Result<String> {
    deployment_service::start_deployment(&pool, &opc_id, &office_id)
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
    opc_id: String,
    limit: i64,
) -> Result<Vec<DeploymentTask>> {
    deployment_service::get_recent_deployments(&pool, &opc_id, limit)
}

#[tauri::command]
pub async fn undeploy(pool: State<'_, DbPool>, opc_id: String) -> Result<()> {
    deployment_service::undeploy(&pool, &opc_id).await
}

#[tauri::command]
pub fn build_deploy_package(pool: State<'_, DbPool>, opc_id: String) -> Result<serde_json::Value> {
    deployment_service::build_deploy_package(&pool, &opc_id)
}

#[tauri::command]
pub async fn deploy_to_office(
    pool: State<'_, DbPool>,
    opc_id: String,
    office_id: String,
) -> Result<serde_json::Value> {
    deployment_service::deploy_to_office(&pool, &opc_id, &office_id).await
}

/// Generate openclaw.json config from OPC data
#[tauri::command]
pub fn generate_openclaw_config(
    pool: State<'_, DbPool>,
    opc_id: String,
) -> Result<serde_json::Value> {
    deployment_service::generate_openclaw_config(&pool, &opc_id)
}

