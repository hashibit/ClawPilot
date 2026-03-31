use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};
use crate::services::office_service;
use crate::services::ssh_service;

/// SSH connection check result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SshConnectionResult {
    pub ok: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// SSH auth check result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SshAuthResult {
    pub ok: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Install daemon result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallDaemonResult {
    pub ok: bool,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

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

/// Check SSH connection (TCP probe to host:port)
#[tauri::command]
pub async fn check_ssh_connection(host: String, port: Option<u16>) -> SshConnectionResult {
    let port = port.unwrap_or(22);
    let result = ssh_service::test_tcp_connection(&host, port, 5);
    SshConnectionResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
    }
}

/// Check SSH authentication
#[tauri::command]
pub async fn check_ssh_auth(
    address: String,
    auth_type: String,
    user: Option<String>,
    password: Option<String>,
    key_path: Option<String>,
) -> SshAuthResult {
    // Parse address - support IP or IP:port format
    let (host, port) = if let Some(idx) = address.find(':') {
        let port_str = &address[idx + 1..];
        let port = port_str.parse().unwrap_or(22);
        (&address[..idx], port)
    } else {
        (address.as_str(), 22)
    };

    let username = user.as_deref().unwrap_or("root");

    let result = if auth_type == "ssh_key" {
        let key_path = match key_path {
            Some(p) => p,
            None => return SshAuthResult {
                ok: false,
                latency_ms: None,
                error: Some("SSH 密钥路径未提供".into()),
            },
        };
        ssh_service::test_ssh_key(host, port, username, &key_path, 8)
    } else {
        let password = match password {
            Some(p) => p,
            None => return SshAuthResult {
                ok: false,
                latency_ms: None,
                error: Some("SSH 密码未提供".into()),
            },
        };
        ssh_service::test_ssh_password(host, port, username, &password, 8)
    };

    SshAuthResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
    }
}

/// Install daemon on remote server via SSH
#[tauri::command]
pub async fn install_daemon(
    _office_id: String,
    _mode: Option<String>,
    _daemon_port: Option<u16>,
    _ssh_host: Option<String>,
    _ssh_port: Option<u16>,
    _ssh_user: Option<String>,
    _ssh_key_path: Option<String>,
    _ssh_config_file: Option<String>,
    _daemon_host: Option<String>,
) -> InstallDaemonResult {
    // Stub: Daemon installation not yet implemented in Tauri version
    InstallDaemonResult {
        ok: false,
        logs: vec![],
        error: Some("Daemon 安装功能尚未在 Tauri 版本中实现".into()),
    }
}

/// Install OpenClaw on remote server
#[tauri::command]
pub async fn install_openclaw(
    _office_id: String,
    _opc_id: String,
    _ssh_host: Option<String>,
    _ssh_port: Option<u16>,
    _ssh_user: Option<String>,
    _ssh_key_path: Option<String>,
) -> InstallDaemonResult {
    // Stub: OpenClaw installation not yet implemented in Tauri version
    InstallDaemonResult {
        ok: false,
        logs: vec![],
        error: Some("OpenClaw 安装功能尚未在 Tauri 版本中实现".into()),
    }
}
