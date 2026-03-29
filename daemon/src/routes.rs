use axum::{
    body::Bytes,
    extract::{Multipart, Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    deploy::{openclaw_gateway_status, run_deploy, run_rollback},
    error::{AppError, Result},
    state::{AppState, TaskRecord},
};

// ── GET /health ──────────────────────────────────────────────

pub async fn health(State(state): State<AppState>) -> Json<Value> {
    let gw = openclaw_gateway_status();
    let task_count = state.tasks.len();

    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "openclaw_status": if gw.is_running { "running" } else { "stopped" },
        "openclaw_pid": gw.pid,
        "openclaw_rpc_ok": gw.rpc_ok,
        "active_tasks": task_count,
    }))
}

// ── POST /deploy ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub opc_id: String,
    pub checksum: Option<String>,
}

pub async fn deploy(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>> {
    let mut manifest: Option<Manifest> = None;
    let mut package_bytes: Option<Bytes> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("multipart error: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "manifest" => {
                let data = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("manifest read error: {}", e))
                })?;
                manifest = Some(serde_json::from_slice(&data)?);
            }
            "package" => {
                package_bytes = Some(
                    field.bytes().await.map_err(|e| {
                        AppError::BadRequest(format!("package read error: {}", e))
                    })?
                );
            }
            _ => {}
        }
    }

    let manifest = manifest.ok_or_else(|| AppError::BadRequest("缺少 manifest 字段".into()))?;
    let package = package_bytes.ok_or_else(|| AppError::BadRequest("缺少 package 字段".into()))?;

    let task_id = format!("deploy-{}", Uuid::new_v4());
    let record = TaskRecord::new(task_id.clone(), manifest.opc_id.clone());
    state.tasks.insert(task_id.clone(), record);

    tracing::info!(
        task_id = %task_id,
        opc_id = %manifest.opc_id,
        pkg_bytes = package.len(),
        "deploy task accepted"
    );

    // Spawn background task
    let state2 = state.clone();
    let tid = task_id.clone();
    let opc_id = manifest.opc_id.clone();
    let checksum = manifest.checksum.clone();
    let pkg_vec = package.to_vec();

    tokio::spawn(async move {
        run_deploy(state2, tid, opc_id, pkg_vec, checksum).await;
    });

    Ok(Json(json!({
        "task_id": task_id,
        "status": "accepted",
        "message": "部署任务已接受",
    })))
}

// ── GET /deploy/:task_id ─────────────────────────────────────

pub async fn deploy_status(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<Json<Value>> {
    let task = state
        .tasks
        .get(&task_id)
        .ok_or_else(|| AppError::NotFound(format!("任务不存在: {}", task_id)))?;

    Ok(Json(serde_json::to_value(&*task)?))
}

// ── POST /rollback ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RollbackRequest {
    pub opc_id: String,
    pub target_version: Option<String>,
}

pub async fn rollback(
    State(state): State<AppState>,
    Json(body): Json<RollbackRequest>,
) -> Result<Json<Value>> {
    let task_id = format!("rollback-{}", Uuid::new_v4());
    let record = TaskRecord::new(task_id.clone(), body.opc_id.clone());
    state.tasks.insert(task_id.clone(), record);

    let state2 = state.clone();
    let tid = task_id.clone();
    let opc_id = body.opc_id.clone();
    let ver = body.target_version.clone();

    tracing::info!(
        task_id = %task_id,
        opc_id = %body.opc_id,
        target_version = ?body.target_version,
        "rollback task accepted"
    );

    tokio::spawn(async move {
        run_rollback(state2, tid, opc_id, ver).await;
    });

    Ok(Json(json!({
        "task_id": task_id,
        "status": "accepted",
        "message": "回滚任务已接受",
    })))
}
