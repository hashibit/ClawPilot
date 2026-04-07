use crate::error::Result;
use crate::openclaw::process::{get_process_info, start_openclaw as start_process, stop_openclaw as stop_process, reload_config};

/// Process status response
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessStatusResponse {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub uptime_seconds: Option<u64>,
    pub probed_at: i64,
    pub daemon_available: bool,
    pub daemon_error: Option<String>,
}

/// Get OpenClaw process status
#[tauri::command]
pub fn get_process_status() -> ProcessStatusResponse {
    let info = get_process_info();
    let is_running = info.state == crate::openclaw::process::ProcessState::Running;
    ProcessStatusResponse {
        is_running,
        pid: info.pid,
        uptime_seconds: info.uptime_secs,
        probed_at: chrono::Utc::now().timestamp_millis(),
        daemon_available: is_running,
        daemon_error: None,
    }
}

/// Start OpenClaw process
#[tauri::command]
pub fn start_openclaw(opc_name: String) -> Result<serde_json::Value> {
    let pid = start_process(&opc_name)?;
    Ok(serde_json::json!({
        "ok": true,
        "message": "started",
        "pid": pid
    }))
}

/// Stop OpenClaw process
#[tauri::command]
pub fn stop_openclaw() -> Result<serde_json::Value> {
    stop_process()?;
    Ok(serde_json::json!({
        "ok": true,
        "message": "stopped"
    }))
}

/// Reload OpenClaw configuration
#[tauri::command]
pub fn reload_openclaw() -> Result<serde_json::Value> {
    reload_config()?;
    Ok(serde_json::json!({
        "ok": true,
        "message": "reloaded"
    }))
}

/// Restart OpenClaw process
#[tauri::command]
pub fn restart_openclaw(opc_name: String) -> Result<serde_json::Value> {
    stop_process()?;
    std::thread::sleep(std::time::Duration::from_millis(500));
    let pid = start_process(&opc_name)?;
    Ok(serde_json::json!({
        "ok": true,
        "message": "restarted",
        "pid": pid
    }))
}
