use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::channel::ChannelConfig;
use crate::services::channel_service;

#[tauri::command]
pub fn get_channels(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<ChannelConfig>> {
    channel_service::get_channels(&pool, &opc_id)
}

#[tauri::command]
pub fn get_channel(pool: State<'_, DbPool>, id: i64) -> Result<ChannelConfig> {
    channel_service::get_channel(&pool, id)
}

#[tauri::command]
pub fn upsert_channel(pool: State<'_, DbPool>, config: ChannelConfig) -> Result<i64> {
    channel_service::upsert_channel(&pool, config)
}

#[tauri::command]
pub fn delete_channel(pool: State<'_, DbPool>, id: i64) -> Result<()> {
    channel_service::delete_channel(&pool, id)
}

#[tauri::command]
pub fn test_feishu_connection(app_id: String, app_secret: String) -> Result<bool> {
    channel_service::test_feishu_connection(&app_id, &app_secret)
}
