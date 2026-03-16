use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::services::snapshot_service::{self, LocalSnapshot};

#[tauri::command]
pub fn create_snapshot(
    pool: State<'_, DbPool>,
    opc_name: String,
    label: String,
    config_data: String,
) -> Result<String> {
    snapshot_service::create_snapshot(&pool, &opc_name, &label, &config_data, false)
}

#[tauri::command]
pub fn get_snapshots(pool: State<'_, DbPool>, opc_name: String) -> Result<Vec<LocalSnapshot>> {
    snapshot_service::get_snapshots(&pool, &opc_name)
}

#[tauri::command]
pub fn get_snapshot(pool: State<'_, DbPool>, id: String) -> Result<LocalSnapshot> {
    snapshot_service::get_snapshot(&pool, &id)
}

#[tauri::command]
pub fn restore_snapshot(pool: State<'_, DbPool>, id: String) -> Result<String> {
    snapshot_service::restore_snapshot(&pool, &id)
}

#[tauri::command]
pub fn delete_snapshot(pool: State<'_, DbPool>, id: String) -> Result<()> {
    snapshot_service::delete_snapshot(&pool, &id)
}
