use axum::{
    body::Bytes,
    extract::{Multipart, Path, State},
    response::sse::{Event, Sse},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::time::Duration;
use uuid::Uuid;

use crate::{
    deploy::{openclaw_gateway_status, openclaw_version, run_deploy, run_rollback},
    error::{AppError, Result},
    install::{run_install_openclaw, InstallRequest},
    state::{AppState, TaskRecord, TaskStatus},
};

// Configuration constants
const MAX_PACKAGE_SIZE: usize = 50 * 1024 * 1024; // 50MB max package size
const MAX_OPC_ID_LEN: usize = 64;

// Validate opc_id format (alphanumeric, dash, underscore only)
fn validate_opc_id(opc_id: &str) -> bool {
    !opc_id.is_empty()
        && opc_id.len() <= MAX_OPC_ID_LEN
        && opc_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// Validate checksum format: "sha256:<64-hex-chars>"
fn validate_checksum(checksum: &str) -> bool {
    if !checksum.starts_with("sha256:") {
        return false;
    }
    let hex_part = &checksum[7..];
    hex_part.len() == 64 && hex_part.chars().all(|c| c.is_ascii_hexdigit())
}

// ── POST /restart ────────────────────────────────────────────

pub async fn restart_openclaw() -> Json<Value> {
    let result = std::process::Command::new("openclaw")
        .args(["gateway", "restart"])
        .output();

    match result {
        Ok(o) if o.status.success() => Json(json!({ "ok": true })),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            Json(json!({ "ok": false, "error": stderr }))
        }
        Err(e) => Json(json!({ "ok": false, "error": e.to_string() })),
    }
}

// ── GET /health ──────────────────────────────────────────────

pub async fn health(State(_state): State<AppState>) -> Json<Value> {
    let gw = openclaw_gateway_status();
    let openclaw_ver = openclaw_version();

    let platform = if cfg!(target_os = "macos") { "darwin" }
                   else if cfg!(target_os = "windows") { "windows" }
                   else { "linux" };
    let arch = if cfg!(target_arch = "aarch64") { "arm64" }
               else if cfg!(target_arch = "x86_64") { "x64" }
               else { std::env::consts::ARCH };

    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": platform,
        "arch": arch,
        "openclaw_status": if gw.is_running { "running" } else { "stopped" },
        "openclaw_version": openclaw_ver,
    }))
}

// ── POST /deploy ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub opc_id: String,
    pub checksum: Option<String>,
    pub opc_root: Option<String>,  // 自定义部署目录
}

pub async fn deploy(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>> {
    let mut manifest: Option<Manifest> = None;
    let mut package_bytes: Option<Bytes> = None;
    let mut total_bytes: usize = 0;

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
                // Stream package bytes with size limit
                let data = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("package read error: {}", e))
                })?;
                total_bytes = total_bytes.saturating_add(data.len());
                if total_bytes > MAX_PACKAGE_SIZE {
                    return Err(AppError::BadRequest(format!(
                        "部署包过大 (max {}MB)",
                        MAX_PACKAGE_SIZE / 1024 / 1024
                    )));
                }
                package_bytes = Some(data);
            }
            _ => {}
        }
    }

    let manifest = manifest.ok_or_else(|| AppError::BadRequest("缺少 manifest 字段".into()))?;
    let package = package_bytes.ok_or_else(|| AppError::BadRequest("缺少 package 字段".into()))?;

    // Validate opc_id format
    if !validate_opc_id(&manifest.opc_id) {
        return Err(AppError::BadRequest("无效的 opc_id 格式".into()));
    }

    // Validate checksum format - required for security
    let checksum_str = manifest.checksum.as_ref()
        .ok_or_else(|| AppError::BadRequest("缺少 checksum (必须提供 sha256 校验值)".into()))?;
    if checksum_str.is_empty() {
        return Err(AppError::BadRequest("checksum 不能为空".into()));
    }
    if !validate_checksum(checksum_str) {
        return Err(AppError::BadRequest("无效的 checksum 格式 (应为 sha256:<64 位 hex>)".into()));
    }

    let task_id = format!("deploy-{}", Uuid::new_v4());
    let record = TaskRecord::new(task_id.clone(), manifest.opc_id.clone());
    state.tasks.insert(task_id.clone(), record);

    tracing::info!(
        task_id = %task_id,
        opc_id = %manifest.opc_id,
        opc_root = %manifest.opc_root.as_deref().unwrap_or("default"),
        pkg_bytes = package.len(),
        "deploy task accepted"
    );

    // Spawn background task
    let state2 = state.clone();
    let tid = task_id.clone();
    let opc_id = manifest.opc_id.clone();
    let checksum = checksum_str.clone();
    let opc_root = manifest.opc_root.clone();
    let pkg_vec = package.to_vec();

    tokio::spawn(async move {
        run_deploy(state2, tid, opc_id, pkg_vec, checksum, opc_root).await;
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

// ── POST /install_openclaw ──────────────────────────────────

pub async fn install_openclaw(
    State(state): State<AppState>,
    Json(req): Json<InstallRequest>,
) -> Json<Value> {
    let task_id = format!("install-{}", Uuid::new_v4());
    let record = TaskRecord::new(task_id.clone(), "openclaw-install".to_string());
    state.tasks.insert(task_id.clone(), record);

    tracing::info!(
        task_id = %task_id,
        version = %req.version,
        platform = %req.platform,
        arch = %req.arch,
        "install_openclaw task accepted"
    );

    let state2 = state.clone();
    let tid = task_id.clone();
    tokio::spawn(async move {
        run_install_openclaw(state2, tid, req).await;
    });

    Json(json!({
        "task_id": task_id,
        "status": "accepted",
        "message": "安装任务已接受",
    }))
}

// ── GET /install_openclaw/:task_id ─────────────────────────

pub async fn install_status(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<Json<Value>> {
    let task = state
        .tasks
        .get(&task_id)
        .ok_or_else(|| AppError::NotFound(format!("任务不存在: {}", task_id)))?;

    Ok(Json(serde_json::to_value(&*task)?))
}

// ── GET /install_openclaw/:task_id/sse ─────────────────────

pub async fn install_sse(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<Sse<impl futures_core::Stream<Item = std::result::Result<Event, std::convert::Infallible>>>> {
    if !state.tasks.contains_key(&task_id) {
        return Err(AppError::NotFound(format!("任务不存在: {}", task_id)));
    }

    let stream = async_stream::stream! {
        let state = state.clone();
        let mut last_count: usize = 0;

        // Send existing logs
        if let Some(task) = state.tasks.get(&task_id) {
            let logs = task.get_state().logs;
            for (i, log_line) in logs.iter().enumerate() {
                last_count = i + 1;
                yield Ok(Event::default().data(log_line.clone()));
            }
        }

        // Poll for new logs until task is complete
        loop {
            tokio::time::sleep(Duration::from_millis(200)).await;

            if let Some(task) = state.tasks.get(&task_id) {
                let task_state = task.get_state();
                let new_logs = &task_state.logs[last_count..];
                for log_line in new_logs {
                    last_count += 1;
                    yield Ok(Event::default().data(log_line.clone()));
                }

                // Stop streaming if task is complete
                if matches!(task_state.status, TaskStatus::Success | TaskStatus::Failed) {
                    yield Ok(Event::default().data("[DONE]"));
                    break;
                }
            } else {
                yield Ok(Event::default().data("[TASK_NOT_FOUND]"));
                break;
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    ))
}
