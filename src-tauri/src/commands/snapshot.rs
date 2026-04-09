use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::services::snapshot_service::{
    self, SnapshotInfo, RestoreSnapshotResponse,
};

/// CreateSnapshot matches proto: rpc CreateSnapshot(CreateSnapshotRequest) returns (CreateSnapshotResponse)
#[tauri::command]
pub fn create_snapshot(
    pool: State<'_, DbPool>,
    opc_id: String,
    label: String,
    is_auto: bool,
) -> Result<String> {
    snapshot_service::create_snapshot(&pool, &opc_id, &label, is_auto)
}

/// GetSnapshots matches proto: rpc GetSnapshots(GetSnapshotsRequest) returns (GetSnapshotsResponse)
#[tauri::command]
pub fn get_snapshots(pool: State<'_, DbPool>, opc_id: String) -> Result<Vec<SnapshotInfo>> {
    snapshot_service::get_snapshots(&pool, &opc_id)
}

/// GetSnapshot matches proto: rpc GetSnapshot(GetSnapshotRequest) returns (SnapshotInfo)
#[tauri::command]
pub fn get_snapshot(pool: State<'_, DbPool>, id: String) -> Result<SnapshotInfo> {
    snapshot_service::get_snapshot(&pool, &id)
}

/// RestoreSnapshot matches proto: rpc RestoreSnapshot(RestoreSnapshotRequest) returns (RestoreSnapshotResponse)
#[tauri::command]
pub fn restore_snapshot(pool: State<'_, DbPool>, id: String) -> Result<RestoreSnapshotResponse> {
    snapshot_service::restore_snapshot(&pool, &id)
}

/// DeleteSnapshot matches proto: rpc DeleteSnapshot(DeleteSnapshotRequest) returns (EmptyResponse)
#[tauri::command]
pub fn delete_snapshot(pool: State<'_, DbPool>, id: String) -> Result<()> {
    snapshot_service::delete_snapshot(&pool, &id)
}