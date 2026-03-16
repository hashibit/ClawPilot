use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::model::{ModelInfo, ProviderConfig};
use crate::services::model_service;

#[tauri::command]
pub fn get_providers(pool: State<'_, DbPool>) -> Result<Vec<ProviderConfig>> {
    model_service::get_providers(&pool)
}

#[tauri::command]
pub fn get_provider(pool: State<'_, DbPool>, provider_type: String) -> Result<ProviderConfig> {
    model_service::get_provider(&pool, &provider_type)
}

#[tauri::command]
pub fn update_provider(pool: State<'_, DbPool>, config: ProviderConfig) -> Result<()> {
    model_service::upsert_provider(&pool, config)
}

#[tauri::command]
pub fn get_models(pool: State<'_, DbPool>) -> Result<Vec<ModelInfo>> {
    model_service::get_models(&pool)
}

#[tauri::command]
pub fn test_provider(pool: State<'_, DbPool>, provider_type: String) -> Result<bool> {
    model_service::test_provider(&pool, &provider_type)
}
