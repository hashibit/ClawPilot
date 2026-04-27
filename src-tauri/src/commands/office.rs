use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{State, Emitter};

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};
use crate::services::office_service;
use crate::services::ssh_service;
use crate::services::daemon_install_service;

/// SSH 本地端口转发隧道（RAII：drop 时自动关闭）
pub struct SshTunnel {
    process: Child,
    pub local_port: u16,
}

impl SshTunnel {
    /// 建立 SSH 本地端口转发，将本机随机端口映射到远程 127.0.0.1:remote_port
    pub fn open(ssh_prefix: &str, ssh_target: &str, remote_port: u16) -> Result<Self> {
        let local_port = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| AppError::Io(e))?
            .local_addr()
            .map_err(|e| AppError::Io(e))?
            .port();

        let process = Command::new("sh")
            .arg("-c")
            .arg(format!(
                "{} -N -L 127.0.0.1:{}:127.0.0.1:{} {}",
                ssh_prefix, local_port, remote_port, ssh_target
            ))
            .spawn()
            .map_err(|e| AppError::Io(e))?;

        // 等隧道端口真正就绪（最多 10s，每 200ms 探测一次）
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            if TcpStream::connect(format!("127.0.0.1:{}", local_port)).is_ok() {
                break;
            }
            if std::time::Instant::now() >= deadline {
                return Err(AppError::Internal(format!(
                    "SSH 隧道端口 {} 在 10s 内未就绪",
                    local_port
                )));
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }

        Ok(Self { process, local_port })
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        let _ = self.process.kill();
    }
}

/// 按 office_id 缓存 SSH 隧道，TTL 内可复用，到期或端口失活时自动清理
pub struct TunnelPool {
    entries: Mutex<HashMap<String, (SshTunnel, Instant)>>,
    ttl: Duration,
}

impl TunnelPool {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            ttl: Duration::from_secs(60),
        }
    }

    /// 返回可用隧道的本地端口（命中缓存则刷新 TTL，否则新建）
    pub fn get_or_create(
        &self,
        office_id: &str,
        create_fn: impl FnOnce() -> Result<SshTunnel>,
    ) -> Result<u16> {
        let mut map = self.entries.lock().unwrap();
        let now = Instant::now();

        // 懒清理过期条目
        map.retain(|_, (_, exp)| now < *exp);

        if let Some((tunnel, exp)) = map.get_mut(office_id) {
            // 验证隧道进程仍然存活
            if TcpStream::connect(format!("127.0.0.1:{}", tunnel.local_port)).is_ok() {
                *exp = now + self.ttl;
                return Ok(tunnel.local_port);
            }
            map.remove(office_id);
        }

        let tunnel = create_fn()?;
        let port = tunnel.local_port;
        map.insert(office_id.to_string(), (tunnel, now + self.ttl));
        Ok(port)
    }
}

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

/// Build the `-i "key_path"` SSH option string.
fn build_ssh_key_arg(key_path: Option<&str>) -> String {
    match key_path {
        Some(p) => format!("-i \"{}\" ", p),
        None => String::new(),
    }
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
    pub platform: Option<String>,
    pub arch: Option<String>,
}

/// Install daemon result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallDaemonResult {
    pub ok: bool,
    pub logs: Vec<String>,
    pub error: Option<String>,
    pub daemon_url: Option<String>,
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
    pool: State<'_, DbPool>,
    tunnel_pool: State<'_, TunnelPool>,
    office_id: String,
) -> Result<DaemonHealthResult> {
    let office = office_service::get_office(&pool, &office_id)?;
    let daemon_url = match office.daemon_url.as_deref() {
        Some(url) if !url.is_empty() => url.to_string(),
        _ => return Ok(DaemonHealthResult { ok: false, error: Some("未配置 Daemon URL".into()), ..Default::default() }),
    };

    // Build optional (node_bin, openclaw_bin) from stored paths
    let bin_paths: Option<(String, String)> = match (
        &office.openclaw_nodejs_path,
        &office.openclaw_install_path,
    ) {
        (Some(n), Some(o)) if !n.is_empty() && !o.is_empty() => Some((n.clone(), o.clone())),
        _ => None,
    };
    let bin_refs = bin_paths.as_ref().map(|(n, o)| (n.as_str(), o.as_str()));

    let address = office.address.as_deref().unwrap_or("");
    let is_remote = !address.is_empty() && address != "localhost";

    if is_remote {
        let (host, ssh_port) = if let Some(idx) = address.rfind(':') {
            let port = address[idx + 1..].parse::<u16>().unwrap_or(22);
            (&address[..idx], port)
        } else {
            (address, 22u16)
        };
        let key_arg = build_ssh_key_arg(office.ssh_key_path.as_deref());
        let ssh_user = office.access_user.as_deref().unwrap_or("root");
        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, ssh_port
        );
        let target = format!("{}@{}", ssh_user, host);
        let local_port = tunnel_pool.get_or_create(&office_id, || {
            SshTunnel::open(&prefix, &target, 16668)
                .map_err(|e| AppError::Internal(format!("SSH 隧道建立失败: {}", e)))
        })?;
        let access_url = format!("http://127.0.0.1:{}", local_port);
        return Ok(office_service::check_daemon_health(&access_url, bin_refs).await);
    }

    Ok(office_service::check_daemon_health(&daemon_url, bin_refs).await)
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

    // Save key_path for later platform detection
    let ssh_key = key_path.clone();

    let result = if auth_type == "ssh_key" {
        let key_path = match key_path {
            Some(p) => p,
            None => return SshAuthResult {
                ok: false,
                latency_ms: None,
                error: Some("SSH 密钥路径未提供".into()),
                sudo_ok: None,
                platform: None,
                arch: None,
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
                platform: None,
                arch: None,
            },
        };
        ssh_service::test_ssh_password(host, port, username, &password, 8)
    };

    if !result.ok {
        return SshAuthResult {
            ok: false,
            latency_ms: Some(result.latency_ms),
            error: result.error,
            sudo_ok: None,
            platform: None,
            arch: None,
        };
    }

    // Detect platform and architecture on remote machine
    let key_path_ref = ssh_key.as_deref();
    let (platform, arch) = match (
        ssh_service::run_ssh_command(host, port, username, key_path_ref, "uname -s", 5),
        ssh_service::run_ssh_command(host, port, username, key_path_ref, "uname -m", 5),
    ) {
        (Ok(os), Ok(raw_arch)) => {
            let platform = if os == "Darwin" { "darwin" } else { "linux" };
            let arch = if raw_arch == "aarch64" || raw_arch == "arm64" { "arm64" } else { "x64" };
            (Some(platform.to_string()), Some(arch.to_string()))
        }
        _ => (None, None),
    };

    SshAuthResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
        sudo_ok: None,
        platform,
        arch,
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

        let key_arg = build_ssh_key_arg(ssh_key_path.as_deref());

        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
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
            // Update office daemon url in DB
            if let Some(url) = &result.daemon_url {
                let _ = office_service::update_office_daemon_config_by_id(&pool, &office_id, url);
            }

            Ok(InstallDaemonResult {
                ok: true,
                logs: result.logs,
                error: None,
                daemon_url: result.daemon_url,
                already_running: None,
            })
        }
        Err(e) => Ok(InstallDaemonResult {
            ok: false,
            logs: vec![],
            error: Some(e.to_string()),
            daemon_url: None,
            already_running: None,
        }),
    }
}

/// Build offline package download URL
fn build_offline_package_url(version: &str, platform: &str, arch: &str) -> String {
    let ext = if platform == "windows" { "zip" } else { "tar.gz" };
    format!(
        "https://github.com/hashibit/openclaw-pkgs/releases/download/v{}/openclaw-pkgs-v{}-{}-{}.{}",
        version, version, platform, arch, ext
    )
}

/// Normalize architecture string (aarch64 -> arm64)
fn normalize_arch(arch: &str) -> &str {
    if arch == "arm64" || arch == "aarch64" {
        "arm64"
    } else {
        "x64"
    }
}

/// Install decoration on target machine via daemon API (auto-installs daemon first if needed)
#[tauri::command(async)]
pub async fn install_decoration(
    app: tauri::AppHandle,
    pool: State<'_, DbPool>,
    office_id: String,
    mode: Option<String>,
    ssh_host: Option<String>,
    ssh_port: Option<u16>,
    ssh_user: Option<String>,
    ssh_key_path: Option<String>,
    _ssh_password: Option<String>,
    _version: Option<String>,
    _platform: Option<String>,
    _arch: Option<String>,
) -> Result<InstallDaemonResult> {
    use crate::services::office_service::get_office;

    let mut logs = Vec::new();
    let mut lg = |line: &str| {
        let clean_line = strip_ansi_codes(line);
        logs.push(clean_line.clone());
        let _ = app.emit("install-log", &InstallLogPayload {
            office_id: office_id.clone(),
            message: clean_line,
            log_type: "info".to_string(),
        });
    };

    // Get latest version from GitHub releases
    lg("🔍 获取最新版本号...");
    let client = reqwest::Client::new();
    let release_resp = client
        .get("https://api.github.com/repos/hashibit/openclaw-pkgs/releases/latest")
        .header("User-Agent", "ClawPilot")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("GitHub API 请求失败: {}", e)))?;
    let release: serde_json::Value = release_resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析 GitHub API 响应失败: {}", e)))?;

    let version = release.get("tag_name")
        .and_then(|v| v.as_str())
        .map(|v| v.trim_start_matches('v').to_string())
        .unwrap_or_default();

    if version.is_empty() {
        return Ok(InstallDaemonResult {
            ok: false,
            logs,
            error: Some("无法获取最新版本号".to_string()),
            daemon_url: None,
            already_running: None,
        });
    }
    lg(&format!("   最新版本: {}", version));

    // Get office from DB
    let mut office = get_office(&pool, &office_id)
        .map_err(|e| AppError::Internal(format!("获取 office 信息失败: {}", e)))?;

    // Build SSH prefix once — used for both daemon install and platform detection
    let is_remote = mode.as_deref() == Some("ssh");
    let (ssh_prefix, ssh_target) = if is_remote {
        let host = ssh_host.unwrap_or_default();
        let port_val = ssh_port.unwrap_or(22);
        let user = ssh_user.as_deref().unwrap_or("root");
        let key_arg = build_ssh_key_arg(ssh_key_path.as_deref());
        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, port_val
        );
        (Some(prefix), Some(format!("{}@{}", user, host)))
    } else {
        (None, None)
    };

    // Detect target platform/arch via SSH (remote) or local system — before daemon starts
    lg("🔍 探测目标平台信息...");
    let (platform, arch) = {
        let os_type = if is_remote {
            daemon_install_service::OsType::detect_remote(
                ssh_prefix.as_deref().unwrap(),
                ssh_target.as_deref().unwrap(),
            ).unwrap_or(daemon_install_service::OsType::Linux)
        } else {
            daemon_install_service::OsType::detect()
                .map_err(|e| AppError::Internal(format!("探测本地 OS 失败: {}", e)))?
        };
        let arch_type = if is_remote {
            daemon_install_service::Arch::detect_remote(
                ssh_prefix.as_deref().unwrap(),
                ssh_target.as_deref().unwrap(),
            ).unwrap_or(daemon_install_service::Arch::X64)
        } else {
            daemon_install_service::Arch::detect()
                .map_err(|e| AppError::Internal(format!("探测本地架构失败: {}", e)))?
        };
        let platform_str = match os_type {
            daemon_install_service::OsType::MacOS => "darwin",
            daemon_install_service::OsType::Linux => "linux",
        };
        (platform_str.to_string(), arch_type.resource_suffix().to_string())
    };
    lg(&format!("   平台: {}, 架构: {}", platform, arch));

    // If daemon not installed, install it first
    let daemon_url = if office.daemon_url.is_some() {
        office.daemon_url.unwrap()
    } else {
        lg("📦 Daemon 未配置，先安装 daemon...");

        let port = 16668u16;
        let install_result = daemon_install_service::install_daemon(port, ssh_prefix.as_deref(), ssh_target.as_deref())
            .map_err(|e| AppError::Internal(format!("daemon 安装失败: {}", e)))?;

        if !install_result.ok {
            return Ok(InstallDaemonResult {
                ok: false,
                logs,
                error: Some("daemon 安装失败".to_string()),
                daemon_url: None,
                already_running: None,
            });
        }

        let daemon_url = install_result.daemon_url
            .ok_or_else(|| AppError::Internal("daemon 安装成功但未返回 URL".to_string()))?;

        // Forward daemon install logs
        for log_line in &install_result.logs {
            lg(log_line);
        }

        // Save daemon url to office
        let _ = office_service::update_office_daemon_config_by_id(&pool, &office_id, &daemon_url);
        office.daemon_url = Some(daemon_url.clone());

        lg("✅ Daemon 安装完成，继续安装 OpenClaw...");
        daemon_url
    };

    lg(&format!("📡 连接 daemon: {}", daemon_url));

    // 远程 daemon 只监听 127.0.0.1，通过 SSH 隧道转发访问
    let _tunnel: Option<SshTunnel>;
    let access_url = if is_remote {
        let tunnel = SshTunnel::open(
            ssh_prefix.as_deref().unwrap(),
            ssh_target.as_deref().unwrap(),
            16668,
        ).map_err(|e| AppError::Internal(format!("SSH 隧道建立失败: {}", e)))?;
        lg(&format!("🔗 SSH 隧道已建立 (127.0.0.1:{})", tunnel.local_port));
        let url = format!("http://127.0.0.1:{}", tunnel.local_port);
        _tunnel = Some(tunnel);
        url
    } else {
        _tunnel = None;
        daemon_url.clone()
    };

    let daemon_client = reqwest::Client::new();

    let download_url = build_offline_package_url(&version, &platform, &arch);
    let sha256_url = format!("{}.sha256", download_url);

    // Submit install task to daemon
    let install_req = serde_json::json!({
        "version": version,
        "platform": platform,
        "arch": arch,
        "download_url": download_url,
        "sha256_url": sha256_url,
    });

    let mut install_builder = daemon_client
        .post(format!("{}/install_openclaw", access_url.trim_end_matches('/')))
        .json(&install_req);
    if let Some(bearer) = crate::utils::daemon_token::bearer_header_value() {
        install_builder = install_builder.header(reqwest::header::AUTHORIZATION, bearer);
    }
    let resp = install_builder
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("daemon 请求失败: {}", e)))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Ok(InstallDaemonResult {
            ok: false,
            logs,
            error: Some(format!("daemon 返回错误: {}", body)),
            daemon_url: None,
            already_running: None,
        });
    }

    let task_resp: serde_json::Value = resp.json().await
        .map_err(|e| AppError::Internal(format!("解析 daemon 响应失败: {}", e)))?;
    let task_id = task_resp["task_id"].as_str()
        .ok_or_else(|| AppError::Internal("daemon 未返回 task_id".to_string()))?
        .to_string();

    lg(&format!("📋 安装任务已提交: {}", task_id));

    // Poll for completion and forward logs
    let mut log_offset: usize = 0;
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        let mut status_builder = daemon_client
            .get(format!("{}/install_openclaw/{}", access_url.trim_end_matches('/'), task_id));
        if let Some(bearer) = crate::utils::daemon_token::bearer_header_value() {
            status_builder = status_builder.header(reqwest::header::AUTHORIZATION, bearer);
        }
        let status_resp = status_builder.send().await;

        match status_resp {
            Ok(resp) if resp.status().is_success() => {
                let task_state: serde_json::Value = resp.json().await
                    .map_err(|e| AppError::Internal(format!("解析任务状态失败: {}", e)))?;

                let state = &task_state["state"];
                let status = state["status"].as_str().unwrap_or("unknown");
                let progress = state["progress"].as_u64().unwrap_or(0);
                let current_step = state["current_step"].as_str().unwrap_or("");

                // Forward new logs by tracking offset
                if let Some(logs_arr) = state["logs"].as_array() {
                    for log_entry in &logs_arr[log_offset..] {
                        if let Some(log_str) = log_entry.as_str() {
                            lg(log_str);
                        }
                    }
                    log_offset = logs_arr.len();
                }

                lg(&format!("   [{}%] {}", progress, current_step));

                if status == "success" {
                    // Detect openclaw & node paths and save to offices table
                    lg("🔍 检测 OpenClaw 安装路径...");
                    let detect_cmds = vec![
                        ("openclaw_bin", "readlink -f ~/.clawpilot/openclaw-current/node_modules/.bin/openclaw 2>/dev/null || echo ~/.clawpilot/openclaw-current/node_modules/.bin/openclaw"),
                        ("node_bin", "readlink -f ~/.clawpilot/openclaw-current/nodejs/bin/node 2>/dev/null || echo ~/.clawpilot/openclaw-current/nodejs/bin/node"),
                    ];
                    let mut detected_openclaw_bin = String::new();
                    let mut detected_node_bin = String::new();
                    for (label, cmd) in detect_cmds {
                        let full_cmd = if is_remote {
                            format!("{} {} '{}'",
                                ssh_prefix.as_deref().unwrap(),
                                ssh_target.as_deref().unwrap(), cmd)
                        } else {
                            cmd.to_string()
                        };
                        if let Ok(out) = tokio::process::Command::new("sh")
                            .arg("-c").arg(&full_cmd).output().await
                        {
                            let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
                            if !val.is_empty() {
                                match label {
                                    "openclaw_bin" => detected_openclaw_bin = val,
                                    "node_bin" => detected_node_bin = val,
                                    _ => {}
                                }
                            }
                        }
                    }
                    if !detected_openclaw_bin.is_empty() && !detected_node_bin.is_empty() {
                        lg(&format!("   openclaw: {}", detected_openclaw_bin));
                        lg(&format!("   node:     {}", detected_node_bin));
                        let _ = office_service::update_office_openclaw_info(
                            &pool, &office_id, &version,
                            &detected_openclaw_bin, &detected_node_bin,
                            Some(&download_url),
                        );
                    }

                    return Ok(InstallDaemonResult {
                        ok: true,
                        logs,
                        error: None,
                        daemon_url: Some(daemon_url.clone()),
                        already_running: None,
                    });
                } else if status == "failed" {
                    let error_msg = state["error"].as_str().unwrap_or("未知错误").to_string();
                    return Ok(InstallDaemonResult {
                        ok: false,
                        logs,
                        error: Some(error_msg),
                        daemon_url: None,
                        already_running: None,
                    });
                }
                // Continue polling for "running" or "pending"
            }
            Ok(resp) => {
                let body = resp.text().await.unwrap_or_default();
                return Ok(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some(format!("daemon 查询失败: {}", body)),
                    daemon_url: None,
                    already_running: None,
                });
            }
            Err(e) => {
                lg(&format!("⚠️  连接 daemon 超时: {}", e));
                // Continue polling, daemon might be busy
            }
        }
    }
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

// ── Unit Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_offline_package_url_linux_x64() {
        let url = build_offline_package_url("2026.4.9", "linux", "x64");
        assert_eq!(
            url,
            "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-linux-x64.tar.gz"
        );
    }

    #[test]
    fn test_build_offline_package_url_linux_arm64() {
        let url = build_offline_package_url("2026.4.9", "linux", "arm64");
        assert_eq!(
            url,
            "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-linux-arm64.tar.gz"
        );
    }

    #[test]
    fn test_build_offline_package_url_darwin_arm64() {
        let url = build_offline_package_url("2026.4.9", "darwin", "arm64");
        assert_eq!(
            url,
            "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-darwin-arm64.tar.gz"
        );
    }

    #[test]
    fn test_build_offline_package_url_windows_x64() {
        let url = build_offline_package_url("2026.4.9", "windows", "x64");
        assert_eq!(
            url,
            "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-windows-x64.zip"
        );
    }

    #[test]
    fn test_build_offline_package_url_windows_arm64() {
        let url = build_offline_package_url("2026.4.9", "windows", "arm64");
        assert_eq!(
            url,
            "https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-windows-arm64.zip"
        );
    }

    #[test]
    fn test_build_offline_package_url_contains_version() {
        let url = build_offline_package_url("2026.5.0", "linux", "x64");
        assert!(url.contains("v2026.5.0"));
        assert!(url.contains("openclaw-pkgs-v2026.5.0"));
    }

    #[test]
    fn test_normalize_arch_arm64() {
        assert_eq!(normalize_arch("arm64"), "arm64");
    }

    #[test]
    fn test_normalize_arch_aarch64() {
        assert_eq!(normalize_arch("aarch64"), "arm64");
    }

    #[test]
    fn test_normalize_arch_x64() {
        assert_eq!(normalize_arch("x64"), "x64");
    }

    #[test]
    fn test_normalize_arch_x86_64() {
        assert_eq!(normalize_arch("x86_64"), "x64");
    }

    #[test]
    fn test_normalize_arch_other_returns_x64() {
        assert_eq!(normalize_arch("ia32"), "x64");
    }
}
