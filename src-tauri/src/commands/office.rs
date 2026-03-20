use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};
use crate::services::office_service;

#[tauri::command]
pub fn get_offices(pool: State<'_, DbPool>) -> Result<Vec<Office>> {
    office_service::get_offices(&pool)
}

#[tauri::command]
pub fn get_office(pool: State<'_, DbPool>, id: String) -> Result<Office> {
    office_service::get_office(&pool, &id)
}

#[tauri::command]
pub fn create_office(pool: State<'_, DbPool>, office: Office) -> Result<String> {
    office_service::create_office(&pool, &office)
}

#[tauri::command]
pub fn update_office(pool: State<'_, DbPool>, id: String, office: Office) -> Result<()> {
    office_service::update_office(&pool, &id, &office)
}

#[tauri::command]
pub fn delete_office(pool: State<'_, DbPool>, id: String) -> Result<()> {
    office_service::delete_office(&pool, &id)
}

#[tauri::command]
pub fn assign_office(
    pool: State<'_, DbPool>,
    opc_id: String,
    office_id: Option<String>,
) -> Result<()> {
    office_service::assign_office(&pool, &opc_id, office_id.as_deref())
}

#[tauri::command]
pub fn get_opc_office(pool: State<'_, DbPool>, opc_id: String) -> Result<Option<Office>> {
    office_service::get_opc_office(&pool, &opc_id)
}

#[tauri::command]
pub fn get_office_deployments(
    pool: State<'_, DbPool>,
    office_id: String,
    limit: Option<i64>,
) -> Result<Vec<OfficeDeployment>> {
    office_service::get_office_deployments(&pool, &office_id, limit.unwrap_or(20))
}

#[tauri::command]
pub async fn check_daemon_health(
    daemon_url: String,
    daemon_api_key: String,
) -> DaemonHealthResult {
    office_service::check_daemon_health(&daemon_url, &daemon_api_key).await
}
