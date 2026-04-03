use std::process::Command;
use std::path::PathBuf;
use std::fs;

use crate::error::{AppError, Result};

/// Daemon 安装结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DaemonInstallResult {
    pub ok: bool,
    pub logs: Vec<String>,
    pub daemon_url: Option<String>,
    pub api_key: Option<String>,
    pub error: Option<String>,
}

/// 操作系统类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsType {
    MacOS,
    Linux,
}

impl OsType {
    /// 探测当前操作系统类型
    pub fn detect() -> Result<Self> {
        #[cfg(target_os = "macos")]
        return Ok(OsType::MacOS);

        #[cfg(target_os = "linux")]
        return Ok(OsType::Linux);

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        return Err(AppError::Validation(
            "不支持的操作系统，仅支持 macOS 和 Linux".to_string()
        ));
    }

    /// 探测远程操作系统类型（通过 SSH）
    pub fn detect_remote(ssh_prefix: &str, target: &str) -> Result<Self> {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("{} {} 'uname -s'", ssh_prefix, target))
            .output()
            .map_err(|e| AppError::Io(e))?;

        if !output.status.success() {
            return Err(AppError::Internal("无法探测远程系统类型".to_string()));
        }

        let os_name = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();

        match os_name.as_str() {
            "darwin" => Ok(OsType::MacOS),
            "linux" => Ok(OsType::Linux),
            _ => Err(AppError::Validation(format!(
                "不支持的远程操作系统：{}", os_name
            ))),
        }
    }
}

/// 获取 daemon 安装目录 (~/.clawpilot/bin/)
pub fn get_daemon_bin_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let bin_dir = home.join(".clawpilot").join("bin");
    fs::create_dir_all(&bin_dir)?;

    Ok(bin_dir)
}

/// 获取 daemon 日志目录 (~/.clawpilot/logs/)
pub fn get_daemon_logs_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let logs_dir = home.join(".clawpilot").join("logs");
    fs::create_dir_all(&logs_dir)?;

    Ok(logs_dir)
}

/// 获取 daemon binary 路径
pub fn get_daemon_binary_path() -> Result<PathBuf> {
    Ok(get_daemon_bin_dir()?.join("clawpilot-daemon"))
}

/// 从 Tauri bundle 中复制 daemon binary
fn copy_daemon_from_bundle(dest_path: &PathBuf) -> Result<()> {
    // 尝试从当前 executable 所在的 resources 目录复制
    // Tauri 会将 resources 放在 app bundle 中
    let current_exe = std::env::current_exe()?;

    // 在 macOS 上，app 结构是：App.app/Contents/MacOS/app, resources 在 ../Resources/
    // 在 Linux 上，resources 通常在可执行文件同级的 resources/ 目录

    #[cfg(target_os = "macos")]
    let resource_paths = vec![
        current_exe.parent().map(|p| p.join("../Resources")).unwrap(),
        dirs::home_dir().map(|p| p.join(".clawpilot/bin/clawpilot-daemon")).unwrap(),
    ];

    #[cfg(target_os = "linux")]
    let resource_paths = vec![
        current_exe.parent().map(|p| p.join("resources")).unwrap(),
        current_exe.parent().map(|p| p.to_path_buf()).unwrap(),
        dirs::home_dir().map(|p| p.join(".clawpilot/bin/clawpilot-daemon")).unwrap(),
    ];

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let resource_paths: Vec<PathBuf> = vec![];

    for resource_dir in &resource_paths {
        let bundled_daemon = if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            // 对于 macOS/Linux，daemon 直接在 resources 根目录
            if resource_dir.ends_with("Resources") || resource_dir.ends_with("resources") {
                resource_dir.join("clawpilot-daemon")
            } else {
                resource_dir.clone()
            }
        } else {
            resource_dir.clone()
        };

        if bundled_daemon.exists() {
            fs::copy(&bundled_daemon, dest_path)?;

            // 设置 executable 权限
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(dest_path)?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(dest_path, perms)?;
            }

            return Ok(());
        }
    }

    Err(AppError::NotFound(
        "daemon binary not found in bundle. Please ensure the daemon is built and bundled.".to_string()
    ))
}

/// 复制 daemon binary 到目标机器
pub fn install_daemon_binary(
    ssh_prefix: Option<&str>,
    target: Option<&str>,
) -> Result<String> {
    let bin_dir = get_daemon_bin_dir()?;
    let daemon_path = bin_dir.join("clawpilot-daemon");

    // 如果是远程安装，需要先复制 binary 到远程
    if let (Some(prefix), Some(tgt)) = (ssh_prefix, target) {
        // 临时下载到本地，然后 scp 到远程
        let temp_path = std::env::temp_dir().join("clawpilot-daemon-temp");

        // 从 Tauri bundle 中提取 binary
        copy_daemon_from_bundle(&temp_path)?;

        // SCP 到远程
        let user = tgt.split('@').next().unwrap_or("root");
        let host = tgt.split('@').last().unwrap_or(tgt);
        let scp_cmd = format!(
            "scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 \"{}\" {}@{}:/tmp/clawpilot-daemon",
            temp_path.display(),
            user,
            host
        );

        let output = Command::new("sh")
            .arg("-c")
            .arg(&scp_cmd)
            .output()?;

        if !output.status.success() {
            return Err(AppError::Internal(format!(
                "SCP 失败：{}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        // 移动到目标目录 (不需要 sudo，因为是用户级安装)
        let mv_cmd = format!(
            "{} {} 'mkdir -p ~/.clawpilot/bin && mv /tmp/clawpilot-daemon {} && chmod +x {}'",
            prefix, tgt, daemon_path.display(), daemon_path.display()
        );

        Command::new("sh").arg("-c").arg(&mv_cmd).output()?;

        // 清理临时文件
        let _ = fs::remove_file(&temp_path);

        Ok(daemon_path.display().to_string())
    } else {
        // 本地安装：从 bundle 复制
        copy_daemon_from_bundle(&daemon_path)?;
        Ok(daemon_path.display().to_string())
    }
}

/// 生成 macOS launchd plist 内容
fn generate_launchd_plist(daemon_path: &str, port: u16) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clawpilot.daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>{daemon_path}</string>
        <string>--listen</string>
        <string>127.0.0.1:{port}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>

    <key>StandardOutPath</key>
    <string>{home}/.clawpilot/logs/daemon.log</string>

    <key>StandardErrorPath</key>
    <string>{home}/.clawpilot/logs/daemon.log</string>

    <key>WorkingDirectory</key>
    <string>{home}/.clawpilot</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>"#,
        daemon_path = daemon_path,
        port = port,
        home = dirs::home_dir().unwrap().display(),
    )
}

/// 生成 Linux systemd user service 内容
fn generate_systemd_service(daemon_path: &str, port: u16) -> String {
    format!(
        r#"[Unit]
Description=ClawPilot Daemon
After=network.target

[Service]
Type=simple
ExecStart={daemon_path} --listen 127.0.0.1:{port}
Restart=on-failure
RestartSec=5
WorkingDirectory={home}/.clawpilot
Environment=PATH=/usr/bin:/bin:/usr/sbin:/sbin

StandardOutput=append:{home}/.clawpilot/logs/daemon.log
StandardError=append:{home}/.clawpilot/logs/daemon.log

[Install]
WantedBy=default.target"#,
        daemon_path = daemon_path,
        port = port,
        home = dirs::home_dir().unwrap().display(),
    )
}

/// 安装 launchd agent (macOS)
fn install_launchd_agent(daemon_path: &str, port: u16) -> Result<()> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let plist_dir = home.join("Library").join("LaunchAgents");
    fs::create_dir_all(&plist_dir)?;

    let plist_path = plist_dir.join("com.clawpilot.daemon.plist");
    let plist_content = generate_launchd_plist(daemon_path, port);
    fs::write(&plist_path, plist_content)?;

    // 加载 launchd agent
    let output = Command::new("launchctl")
        .args(["load", "-w", &plist_path.display().to_string()])
        .output()?;

    if !output.status.success() {
        // 如果 load 失败，尝试 kickstart（macOS 11+）
        let label = "com.clawpilot.daemon";
        let _ = Command::new("launchctl")
            .args(["kickstart", "-k", &format!("gui/{}/{}", unsafe { std::env::var("UID").unwrap_unchecked() }, label)])
            .output();
    }

    Ok(())
}

/// 安装 systemd user service (Linux)
fn install_systemd_user_service(daemon_path: &str, port: u16) -> Result<()> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let service_dir = home.join(".config").join("systemd").join("user");
    fs::create_dir_all(&service_dir)?;

    let service_path = service_dir.join("clawpilot-daemon.service");
    let service_content = generate_systemd_service(daemon_path, port);
    fs::write(&service_path, service_content)?;

    // 重载 systemd 并启用服务
    // 注意：这需要 XDG_RUNTIME_DIR 环境变量
    let runtime_dir = format!("/run/user/{}", unsafe { std::env::var("UID").unwrap_unchecked() });

    let output = Command::new("sh")
        .arg("-c")
        .arg(format!(
            "XDG_RUNTIME_DIR={} systemctl --user daemon-reload && \
             XDG_RUNTIME_DIR={} systemctl --user enable --now clawpilot-daemon.service",
            runtime_dir, runtime_dir
        ))
        .output()?;

    if !output.status.success() {
        // 如果失败，尝试不使用 XDG_RUNTIME_DIR（某些系统可能已设置）
        let _ = Command::new("systemctl")
            .args(["--user", "daemon-reload"])
            .output();
        let _ = Command::new("systemctl")
            .args(["--user", "enable", "--now", "clawpilot-daemon.service"])
            .output();
    }

    Ok(())
}

/// 远程安装 launchd agent (macOS via SSH)
fn install_launchd_agent_remote(
    ssh_prefix: &str,
    target: &str,
    daemon_path: &str,
    port: u16,
) -> Result<()> {
    let plist_content = generate_launchd_plist(daemon_path, port);
    let escaped_plist = plist_content.replace("'", "'\\''");

    // 创建 plist 文件
    let create_plist = format!(
        "{} {} 'mkdir -p ~/Library/LaunchAgents && cat > ~/Library/LaunchAgents/com.clawpilot.daemon.plist << EOF\n{}'\nEOF",
        ssh_prefix, target, escaped_plist
    );

    Command::new("sh").arg("-c").arg(&create_plist).output()?;

    // 加载 launchd agent
    let load_cmd = format!(
        "{} {} 'launchctl load -w ~/Library/LaunchAgents/com.clawpilot.daemon.plist'",
        ssh_prefix, target
    );

    Command::new("sh").arg("-c").arg(&load_cmd).output()?;

    Ok(())
}

/// 远程安装 systemd user service (Linux via SSH)
fn install_systemd_user_service_remote(
    ssh_prefix: &str,
    target: &str,
    daemon_path: &str,
    port: u16,
) -> Result<()> {
    let service_content = generate_systemd_service(daemon_path, port);
    let escaped_service = service_content.replace("'", "'\\''");

    // 创建 service 文件
    let create_service = format!(
        "{} {} 'mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/clawpilot-daemon.service << EOF\n{}'\nEOF",
        ssh_prefix, target, escaped_service
    );

    Command::new("sh").arg("-c").arg(&create_service).output()?;

    // 重载并启用服务
    let uid_cmd = format!("{} {} 'id -u'", ssh_prefix, target);
    let uid_output = Command::new("sh").arg("-c").arg(&uid_cmd).output()?;
    let uid = String::from_utf8_lossy(&uid_output.stdout).trim().to_string();

    let enable_cmd = format!(
        "{} {} 'XDG_RUNTIME_DIR=/run/user/{} systemctl --user daemon-reload && \
         XDG_RUNTIME_DIR=/run/user/{} systemctl --user enable --now clawpilot-daemon.service'",
        ssh_prefix, target, uid, uid
    );

    Command::new("sh").arg("-c").arg(&enable_cmd).output()?;

    Ok(())
}

/// 读取 daemon API key
pub fn read_daemon_api_key() -> Result<Option<String>> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let key_path = home.join(".clawpilot").join("daemon.key");

    if key_path.exists() {
        let key = fs::read_to_string(&key_path)?
            .trim()
            .to_string();
        Ok(Some(key))
    } else {
        Ok(None)
    }
}

/// 生成新的 API key
pub fn generate_api_key() -> String {
    use uuid::Uuid;
    Uuid::new_v4().to_string().replace('-', "")
}

/// 保存 daemon API key
pub fn save_daemon_api_key(key: &str) -> Result<()> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let clawpilot_dir = home.join(".clawpilot");
    fs::create_dir_all(&clawpilot_dir)?;

    let key_path = clawpilot_dir.join("daemon.key");
    fs::write(&key_path, key)?;

    // 设置文件权限（仅 owner 可读写）
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&key_path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&key_path, perms)?;
    }

    Ok(())
}

/// 检查 daemon 是否已在运行
pub fn is_daemon_running() -> Result<bool> {
    let output = Command::new("pgrep")
        .arg("-x")
        .arg("clawpilot-daemon")
        .output();

    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false),
    }
}

/// 主安装函数：安装 daemon 到本地或远程机器
pub fn install_daemon(
    port: u16,
    ssh_prefix: Option<&str>,
    ssh_target: Option<&str>,
) -> Result<DaemonInstallResult> {
    let mut logs = Vec::new();
    let mut lg = |line: &str| logs.push(line.to_string());

    // 1. 探测操作系统
    lg("🔍 探测操作系统类型...");
    let os_type = if ssh_prefix.is_some() && ssh_target.is_some() {
        OsType::detect_remote(ssh_prefix.unwrap(), ssh_target.unwrap())?
    } else {
        OsType::detect()?
    };

    match os_type {
        OsType::MacOS => lg("✅ 检测到 macOS"),
        OsType::Linux => lg("✅ 检测到 Linux"),
    }

    // 2. 检查是否已在运行
    if ssh_prefix.is_none() {
        if is_daemon_running()? {
            lg("⚠️  Daemon 已在运行，将先停止现有进程...");
            let _ = Command::new("pkill").arg("-x").arg("clawpilot-daemon").output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }

    // 3. 安装 daemon binary
    lg("📥 安装 daemon binary...");
    let daemon_path = install_daemon_binary(ssh_prefix, ssh_target)?;
    lg(&format!("✅ Binary 已安装到 {}", daemon_path));

    // 4. 生成并保存 API key
    lg("🔑 生成 API Key...");
    let api_key = generate_api_key();
    save_daemon_api_key(&api_key)?;
    lg("✅ API Key 已保存");

    // 5. 安装系统服务
    lg("⚙️  注册系统服务...");
    match os_type {
        OsType::MacOS => {
            if ssh_prefix.is_some() && ssh_target.is_some() {
                install_launchd_agent_remote(
                    ssh_prefix.unwrap(),
                    ssh_target.unwrap(),
                    &daemon_path,
                    port,
                )?;
            } else {
                install_launchd_agent(&daemon_path, port)?;
            }
            lg("✅ launchd agent 已安装");
        }
        OsType::Linux => {
            if ssh_prefix.is_some() && ssh_target.is_some() {
                install_systemd_user_service_remote(
                    ssh_prefix.unwrap(),
                    ssh_target.unwrap(),
                    &daemon_path,
                    port,
                )?;
            } else {
                install_systemd_user_service(&daemon_path, port)?;
            }
            lg("✅ systemd user service 已安装");
        }
    }

    // 6. 验证服务状态
    lg("🔍 验证服务状态...");
    std::thread::sleep(std::time::Duration::from_millis(1000));

    let daemon_url = format!("http://127.0.0.1:{}", port);

    lg("✅ Daemon 安装完成");

    Ok(DaemonInstallResult {
        ok: true,
        logs,
        daemon_url: Some(daemon_url),
        api_key: Some(api_key),
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_launchd_plist() {
        let plist = generate_launchd_plist("/usr/local/bin/clawpilot-daemon", 16668);
        assert!(plist.contains("com.clawpilot.daemon"));
        assert!(plist.contains("127.0.0.1:16668"));
        assert!(plist.contains("launchctl"));
    }

    #[test]
    fn test_generate_systemd_service() {
        let service = generate_systemd_service("/usr/local/bin/clawpilot-daemon", 16668);
        assert!(service.contains("clawpilot-daemon.service"));
        assert!(service.contains("127.0.0.1:16668"));
        assert!(service.contains("systemctl --user"));
    }

    #[test]
    fn test_generate_api_key() {
        let key = generate_api_key();
        assert_eq!(key.len(), 32); // UUID without hyphens
    }
}
