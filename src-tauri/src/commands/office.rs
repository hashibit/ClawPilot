use tauri::{State, Emitter};

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};
use crate::services::office_service;
use crate::services::ssh_service;
use crate::services::daemon_install_service;

/// Install log payload for Tauri events
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallLogPayload {
    pub office_id: String,
    pub message: String,
    pub log_type: String,
}

/// Remove ANSI color codes from a string (e.g., `\x1b[38;2;0;229;204m` -> empty)
fn strip_ansi_codes(s: &str) -> String {
    // ANSI escape sequences: ESC[ ... m or ESC[ ... K etc.
    // Pattern: \x1b\[ [0-9;?]* [A-Za-z]
    let re = regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").unwrap();
    re.replace_all(s, "").into_owned()
}

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
    pub sudo_ok: Option<bool>,
}

/// Install daemon result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallDaemonResult {
    pub ok: bool,
    pub logs: Vec<String>,
    pub error: Option<String>,
    pub daemon_url: Option<String>,
    pub api_key: Option<String>,
    pub already_running: Option<bool>,
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

/// Check SSH connection using system ssh command
#[tauri::command]
pub async fn check_ssh_connection(
    host: String,
    port: Option<u16>,
    user: Option<String>,
    key_path: Option<String>,
) -> SshConnectionResult {
    let port = port.unwrap_or(22);
    let username = user.as_deref().unwrap_or("root");
    let result = ssh_service::test_ssh_connection(&host, port, username, key_path.as_deref(), 5);
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
                sudo_ok: None,
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
                sudo_ok: None,
            },
        };
        ssh_service::test_ssh_password(host, port, username, &password, 8)
    };

    SshAuthResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
        sudo_ok: None,
    }
}

/// Install daemon on local or remote server via SSH
#[tauri::command(async)]
pub async fn install_daemon(
    pool: State<'_, DbPool>,
    office_id: String,
    mode: Option<String>,
    daemon_port: Option<u16>,
    ssh_host: Option<String>,
    ssh_port: Option<u16>,
    ssh_user: Option<String>,
    ssh_key_path: Option<String>,
    _ssh_password: Option<String>,
    _ssh_config_file: Option<String>,
    _daemon_host: Option<String>,
) -> Result<InstallDaemonResult> {
    let port = daemon_port.unwrap_or(16668);
    let is_remote = mode.as_deref() == Some("ssh");

    // Build SSH prefix if remote
    let (ssh_prefix, ssh_target) = if is_remote {
        let host = ssh_host.unwrap_or_default();
        let port = ssh_port.unwrap_or(22);
        let user = ssh_user.as_deref().unwrap_or("root");

        let key_arg = if let Some(ref key_path) = ssh_key_path {
            format!("-i \"{}\" ", key_path)
        } else {
            String::new()
        };

        let prefix = format!(
            "ssh {}-t -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, port
        );

        let target = format!("{}@{}", user, host);
        (Some(prefix), Some(target))
    } else {
        (None, None)
    };

    // Call the service layer
    match daemon_install_service::install_daemon(port, ssh_prefix.as_deref(), ssh_target.as_deref()) {
        Ok(result) => {
            // Update office daemon config in DB
            if let (Some(url), Some(key)) = (&result.daemon_url, &result.api_key) {
                let _ = office_service::update_office_daemon_config_by_id(&pool, &office_id, url, key);
            }

            Ok(InstallDaemonResult {
                ok: true,
                logs: result.logs,
                error: None,
                daemon_url: result.daemon_url,
                api_key: result.api_key,
                already_running: None,
            })
        }
        Err(e) => Ok(InstallDaemonResult {
            ok: false,
            logs: vec![],
            error: Some(e.to_string()),
            daemon_url: None,
            api_key: None,
            already_running: None,
        }),
    }
}

/// Install OpenClaw on local or remote server
#[tauri::command(async)]
pub async fn install_openclaw(
    app: tauri::AppHandle,
    _pool: State<'_, DbPool>,
    office_id: String,
    mode: Option<String>,
    ssh_host: Option<String>,
    ssh_port: Option<u16>,
    ssh_user: Option<String>,
    ssh_key_path: Option<String>,
    _ssh_password: Option<String>,
) -> Result<InstallDaemonResult> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let is_remote = mode.as_deref() == Some("ssh");

    // Build SSH prefix if remote
    let (ssh_prefix, ssh_target) = if is_remote {
        let host = ssh_host.unwrap_or_default();
        let port = ssh_port.unwrap_or(22);
        let user = ssh_user.as_deref().unwrap_or("root");

        let key_arg = if let Some(ref key_path) = ssh_key_path {
            format!("-i \"{}\" ", key_path)
        } else {
            String::new()
        };

        let prefix = format!(
            "ssh {}-t -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, port
        );

        let target = format!("{}@{}", user, host);
        (Some(prefix), Some(target))
    } else {
        (None, None)
    };

    let mut logs = Vec::new();
    let mut lg = |line: &str| {
        // Strip ANSI color codes for clean UI display
        let clean_line = strip_ansi_codes(line);
        logs.push(clean_line.clone());
        // 实时发送到前端
        let _ = app.emit("install-log", &InstallLogPayload {
            office_id: office_id.clone(),
            message: clean_line,
            log_type: "info".to_string(),
        });
    };

    lg("🔍 探测操作系统类型...");

    // Detect OS type
    let _os_type = if is_remote {
        match daemon_install_service::OsType::detect_remote(
            ssh_prefix.as_ref().unwrap(),
            ssh_target.as_ref().unwrap(),
        ) {
            Ok(os) => {
                lg(&format!("✅ 检测到 {}", match os {
                    daemon_install_service::OsType::MacOS => "macOS",
                    daemon_install_service::OsType::Linux => "Linux",
                }));
                os
            }
            Err(e) => {
                lg(&format!("❌ 无法探测系统类型：{}", e));
                return Ok(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some("无法探测远程系统类型".to_string()),
                    daemon_url: None,
                    api_key: None,
                    already_running: None,
                });
            }
        }
    } else {
        match daemon_install_service::OsType::detect() {
            Ok(os) => {
                lg(&format!("✅ 检测到 {}", match os {
                    daemon_install_service::OsType::MacOS => "macOS",
                    daemon_install_service::OsType::Linux => "Linux",
                }));
                os
            }
            Err(e) => {
                lg(&format!("❌ 不支持的操作系统：{}", e));
                return Ok(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some("不支持的操作系统".to_string()),
                    daemon_url: None,
                    api_key: None,
                    already_running: None,
                });
            }
        }
    };

    // Step 1: Check if OpenClaw is already installed
    lg("🔍 检查 OpenClaw 是否已安装...");

    let check_cmd = if is_remote {
        format!(
            "{} {} 'which openclaw && openclaw --version'",
            ssh_prefix.as_ref().unwrap(),
            ssh_target.as_ref().unwrap()
        )
    } else {
        "which openclaw && openclaw --version".to_string()
    };

    let check_output = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&check_cmd)
        .output()
        .await?;

    let openclaw_installed = check_output.status.success();
    if openclaw_installed {
        let version_info = String::from_utf8_lossy(&check_output.stdout).trim().to_string();
        lg(&format!("✅ OpenClaw 已安装：{}", version_info.lines().last().unwrap_or("")));
    } else {
        lg("⚠️ OpenClaw 未安装，将执行安装...");
    }

    // Step 2: Install OpenClaw only if not already installed
    let mut line = String::new();  // Reused for all streaming reads
    if !openclaw_installed {
        lg("📥 下载并执行 OpenClaw 安装脚本...");

        let install_cmd = if is_remote {
            format!(
                "{} {} 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --non-interactive --skip-skills --skip-health --accept-risk'",
                ssh_prefix.as_ref().unwrap(),
                ssh_target.as_ref().unwrap()
            )
        } else {
            "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --non-interactive --skip-skills --skip-health --accept-risk".to_string()
        };

        // Use spawn() + Stdio::piped() for streaming output
        let mut child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&install_cmd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Stream stdout line by line
        let mut stdout = BufReader::new(child.stdout.take().unwrap());

        while stdout.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                lg(trimmed);
            }
            line.clear();
        }

        // Also read stderr
        let mut stderr = BufReader::new(child.stderr.take().unwrap());
        line.clear();
        while stderr.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                lg(&format!("❌ {}", trimmed));
            }
            line.clear();
        }

        let status = child.wait().await?;

        if !status.success() {
            lg("❌ 安装失败");
            return Ok(InstallDaemonResult {
                ok: false,
                logs,
                error: Some("OpenClaw 安装失败".to_string()),
                daemon_url: None,
                api_key: None,
                already_running: None,
            });
        }

        lg("✅ OpenClaw 安装完成");
    }

    // Register daemon service using openclaw onboard
    lg("⚙️  注册 OpenClaw 系统服务...");

    let onboard_cmd = if is_remote {
        format!(
            "{} {} 'openclaw onboard --non-interactive --install-daemon --skip-skills --skip-health --accept-risk'",
            ssh_prefix.as_ref().unwrap(),
            ssh_target.as_ref().unwrap()
        )
    } else {
        "openclaw onboard --non-interactive --install-daemon --skip-skills --skip-health --accept-risk".to_string()
    };

    // Stream onboard output
    let mut onboard_child = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&onboard_cmd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let mut onboard_stdout = BufReader::new(onboard_child.stdout.take().unwrap());
    line.clear();
    while onboard_stdout.read_line(&mut line).await? > 0 {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            lg(trimmed);
        }
        line.clear();
    }

    let onboard_status = onboard_child.wait().await?;

    if !onboard_status.success() {
        lg("⚠️  服务注册失败（可选步骤，可手动执行）");
    } else {
        lg("✅ OpenClaw 系统服务已注册");
    }

    Ok(InstallDaemonResult {
        ok: true,
        logs,
        error: None,
        daemon_url: None,
        api_key: None,
        already_running: None,
    })
}

/// Probe local daemon for running daemon on common ports
#[tauri::command]
pub async fn probe_local_daemon(
    pool: State<'_, DbPool>,
    office_id: Option<String>,
) -> Result<office_service::ProbeDaemonResult> {
    Ok(office_service::probe_local_daemon(&pool, office_id.as_deref()).await)
}

/// Probe remote daemon via SSH
#[tauri::command]
pub async fn probe_remote_daemon(
    pool: State<'_, DbPool>,
    office_id: String,
) -> Result<office_service::ProbeDaemonResult> {
    Ok(office_service::probe_remote_daemon(&pool, &office_id).await)
}

/// Get the version of local clawpilot-daemon binary
#[tauri::command]
pub async fn get_local_daemon_version() -> Result<Option<String>> {
    office_service::get_local_daemon_version().await
}
