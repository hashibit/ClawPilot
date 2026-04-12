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

/// CPU 架构
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    Arm64,
    X64,
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

    /// 资源文件中的平台后缀
    pub fn resource_suffix(self) -> &'static str {
        match self {
            OsType::MacOS => "macos",
            OsType::Linux => "linux",
        }
    }
}

impl Arch {
    /// 探测当前 CPU 架构
    pub fn detect() -> Result<Self> {
        let output = Command::new("uname")
            .arg("-m")
            .output()
            .map_err(|e| AppError::Io(e))?;

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Self::from_uname(&raw))
    }

    /// 探测远程 CPU 架构（通过 SSH）
    pub fn detect_remote(ssh_prefix: &str, target: &str) -> Result<Self> {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("{} {} 'uname -m'", ssh_prefix, target))
            .output()
            .map_err(|e| AppError::Io(e))?;

        if !output.status.success() {
            return Err(AppError::Internal("无法探测远程架构".to_string()));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Self::from_uname(&raw))
    }

    /// 从 uname -m 输出归一化
    fn from_uname(raw: &str) -> Self {
        match raw {
            "arm64" | "aarch64" => Arch::Arm64,
            _ => Arch::X64,
        }
    }

    /// 资源文件中的架构后缀
    pub fn resource_suffix(self) -> &'static str {
        match self {
            Arch::Arm64 => "arm64",
            Arch::X64 => "x64",
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

/// 从 Tauri bundle 中复制对应平台和架构的 daemon binary
fn copy_daemon_from_bundle(dest_path: &PathBuf, os: OsType, arch: Arch) -> Result<()> {
    let current_exe = std::env::current_exe()?;

    // 资源搜索路径
    #[cfg(target_os = "macos")]
    let resource_paths: Vec<PathBuf> = vec![
        current_exe.parent().map(|p| p.join("../Resources")).unwrap(),
        PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources")),
    ];

    #[cfg(target_os = "linux")]
    let resource_paths: Vec<PathBuf> = vec![
        current_exe.parent().map(|p| p.join("resources")).unwrap(),
        current_exe.parent().map(|p| p.to_path_buf()).unwrap(),
        PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources")),
    ];

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let resource_paths: Vec<PathBuf> = vec![];

    // 目标 binary 文件名：clawpilot-daemon-{os}-{arch}
    let target_name = format!("clawpilot-daemon-{}-{}", os.resource_suffix(), arch.resource_suffix());

    for resource_dir in &resource_paths {
        let entries = match fs::read_dir(resource_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().map(|n| n.to_string_lossy()) {
                if name == target_name.as_str() {
                    fs::copy(&path, dest_path)?;
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
        }
    }

    Err(AppError::NotFound(
        format!("daemon binary not found in bundle: {}. Please ensure the daemon is built and bundled.", target_name)
    ))
}

/// 从 SSH 前缀字符串中提取 `-i "key_path"` 选项（用于 SCP 命令）
fn extract_ssh_key_arg(ssh_prefix: &str) -> String {
    if let Some(start) = ssh_prefix.find("-i \"") {
        let rest = &ssh_prefix[start + 4..];
        if let Some(end) = rest.find('"') {
            return format!("-i \"{}\" ", &rest[..end]);
        }
    }
    String::new()
}

/// 从 SSH 前缀字符串中提取端口号（用于 SCP 的 -P 选项）
fn extract_ssh_port(ssh_prefix: &str) -> Option<u16> {
    let parts: Vec<&str> = ssh_prefix.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "-p" {
            if let Some(port_str) = parts.get(i + 1) {
                if let Ok(port) = port_str.parse::<u16>() {
                    return Some(port);
                }
            }
        }
    }
    None
}

/// 复制 daemon binary 到目标机器
pub fn install_daemon_binary(
    ssh_prefix: Option<&str>,
    ssh_target: Option<&str>,
    target_os: OsType,
    target_arch: Arch,
) -> Result<String> {
    let bin_dir = get_daemon_bin_dir()?;
    let daemon_path = bin_dir.join("clawpilot-daemon");

    // 如果是远程安装，需要先复制 binary 到远程
    if let (Some(prefix), Some(tgt)) = (ssh_prefix, ssh_target) {
        // 临时下载到本地，然后 scp 到远程
        let temp_path = std::env::temp_dir().join("clawpilot-daemon-temp");

        // 从 Tauri bundle 中提取对应架构的 binary
        copy_daemon_from_bundle(&temp_path, target_os, target_arch)?;

        // SCP 到远程（从 ssh_prefix 提取 key 和 port，确保与 SSH 命令一致）
        let user = tgt.split('@').next().unwrap_or("root");
        let host = tgt.split('@').last().unwrap_or(tgt);
        let key_arg = extract_ssh_key_arg(prefix);
        let port_arg = extract_ssh_port(prefix)
            .filter(|&p| p != 22)
            .map(|p| format!("-P {} ", p))
            .unwrap_or_default();
        let scp_cmd = format!(
            "scp {}{}-o StrictHostKeyChecking=no -o ConnectTimeout=10 \"{}\" {}@{}:/tmp/clawpilot-daemon",
            key_arg,
            port_arg,
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

        // 移动到远程目标目录（使用远程机器上的 ~ 展开）
        let remote_bin_path = "~/.clawpilot/bin/clawpilot-daemon";
        let mv_cmd = format!(
            "{} {} 'mkdir -p ~/.clawpilot/bin ~/.clawpilot/logs && mv /tmp/clawpilot-daemon {} && chmod +x {}'",
            prefix, tgt, remote_bin_path, remote_bin_path
        );

        Command::new("sh").arg("-c").arg(&mv_cmd).output()?;

        // 清理临时文件
        let _ = fs::remove_file(&temp_path);

        Ok(remote_bin_path.to_string())
    } else {
        // 本地安装：从 bundle 复制
        copy_daemon_from_bundle(&daemon_path, target_os, target_arch)?;
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

/// 获取当前用户 UID（通过 id -u，不依赖 UID 环境变量）
fn get_uid() -> Result<String> {
    let output = Command::new("id").arg("-u").output()?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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

    let uid = get_uid()?;
    let plist_str = plist_path.display().to_string();
    let gui_target = format!("gui/{}", uid);

    // 先卸载旧服务（若不存在则忽略错误）
    let _ = Command::new("launchctl")
        .args(["bootout", &gui_target, &plist_str])
        .output();

    // macOS 10.15+ 推荐方式：bootstrap（用户级，无需 sudo）
    let output = Command::new("launchctl")
        .args(["bootstrap", &gui_target, &plist_str])
        .output()?;

    if !output.status.success() {
        // 旧版 macOS 回退到 load（同样无需 sudo）
        let _ = Command::new("launchctl")
            .args(["load", "-w", &plist_str])
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
    let uid = get_uid()?;
    let runtime_dir = format!("/run/user/{}", uid);

    let output = Command::new("sh")
        .arg("-c")
        .arg(format!(
            "XDG_RUNTIME_DIR={} systemctl --user daemon-reload && \
             XDG_RUNTIME_DIR={} systemctl --user enable --now clawpilot-daemon.service",
            runtime_dir, runtime_dir
        ))
        .output()?;

    if !output.status.success() {
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

    let create_plist = format!(
        "{} {} 'mkdir -p ~/Library/LaunchAgents && cat > ~/Library/LaunchAgents/com.clawpilot.daemon.plist << EOF\n{}'\nEOF",
        ssh_prefix, target, escaped_plist
    );

    Command::new("sh").arg("-c").arg(&create_plist).output()?;

    let uid_output = Command::new("sh")
        .arg("-c")
        .arg(format!("{} {} 'id -u'", ssh_prefix, target))
        .output()?;
    let uid = String::from_utf8_lossy(&uid_output.stdout).trim().to_string();

    let load_cmd = format!(
        "{} {} 'launchctl bootout gui/{uid} ~/Library/LaunchAgents/com.clawpilot.daemon.plist 2>/dev/null; \
         launchctl bootstrap gui/{uid} ~/Library/LaunchAgents/com.clawpilot.daemon.plist || \
         launchctl load -w ~/Library/LaunchAgents/com.clawpilot.daemon.plist'",
        ssh_prefix, target, uid = uid
    );

    Command::new("sh").arg("-c").arg(&load_cmd).output()?;

    Ok(())
}

/// 生成远程 systemd user service 内容（所有路径用 %h，systemd 会展开为远程用户 home）
fn generate_systemd_service_remote(port: u16) -> String {
    format!(
        r#"[Unit]
Description=ClawPilot Daemon
After=network.target

[Service]
Type=simple
ExecStart=%h/.clawpilot/bin/clawpilot-daemon --listen 127.0.0.1:{port}
Restart=on-failure
RestartSec=5
WorkingDirectory=%h/.clawpilot
Environment=PATH=/usr/bin:/bin:/usr/sbin:/sbin

StandardOutput=append:%h/.clawpilot/logs/daemon.log
StandardError=append:%h/.clawpilot/logs/daemon.log

[Install]
WantedBy=default.target"#,
        port = port,
    )
}

/// 远程安装 systemd user service (Linux via SSH)
fn install_systemd_user_service_remote(
    ssh_prefix: &str,
    target: &str,
    daemon_path: &str,
    port: u16,
) -> Result<()> {
    let service_content = generate_systemd_service_remote(port);
    let escaped_service = service_content.replace("'", "'\\''");

    let create_service = format!(
        "{} {} 'mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/clawpilot-daemon.service << EOF\n{}'\nEOF",
        ssh_prefix, target, escaped_service
    );

    Command::new("sh").arg("-c").arg(&create_service).output()?;

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

    // 2. 探测 CPU 架构
    lg("🔍 探测 CPU 架构...");
    let arch = if ssh_prefix.is_some() && ssh_target.is_some() {
        Arch::detect_remote(ssh_prefix.unwrap(), ssh_target.unwrap())?
    } else {
        Arch::detect()?
    };

    match arch {
        Arch::Arm64 => lg("✅ 检测到 arm64"),
        Arch::X64 => lg("✅ 检测到 x64"),
    }

    // 3. 检查是否已在运行
    if ssh_prefix.is_none() {
        if is_daemon_running()? {
            lg("⚠️  Daemon 已在运行，将先停止现有进程...");
            let _ = Command::new("pkill").arg("-x").arg("clawpilot-daemon").output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }

    // 4. 安装 daemon binary
    lg("📥 安装 daemon binary...");
    let daemon_path = install_daemon_binary(
        ssh_prefix,
        ssh_target,
        os_type,
        arch,
    )?;
    lg(&format!("✅ Binary 已安装到 {}", daemon_path));

    // 5. 生成并保存 API key
    lg("🔑 生成 API Key...");
    let api_key = generate_api_key();
    if let (Some(prefix), Some(tgt)) = (ssh_prefix, ssh_target) {
        // 远程安装：将 key 写到远程机器，daemon 启动后会读取它
        let write_key_cmd = format!(
            "{} {} 'mkdir -p ~/.clawpilot && printf \"%s\" \"{}\" > ~/.clawpilot/daemon.key && chmod 600 ~/.clawpilot/daemon.key'",
            prefix, tgt, api_key
        );
        Command::new("sh").arg("-c").arg(&write_key_cmd).output()?;
    } else {
        save_daemon_api_key(&api_key)?;
    }
    lg("✅ API Key 已保存");

    // 6. 安装系统服务
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

    // 7. 验证服务状态
    lg("🔍 验证服务状态...");
    std::thread::sleep(std::time::Duration::from_millis(1000));

    if let (Some(prefix), Some(tgt)) = (ssh_prefix, ssh_target) {
        let check_cmd = match os_type {
            OsType::Linux => format!(
                "{} {} 'systemctl --user is-active clawpilot-daemon'",
                prefix, tgt
            ),
            OsType::MacOS => format!(
                "{} {} 'launchctl list com.clawpilot.daemon 2>/dev/null | grep -q PID && echo active || echo inactive'",
                prefix, tgt
            ),
        };
        let out = Command::new("sh").arg("-c").arg(&check_cmd).output();
        let active = out.map(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            s == "active"
        }).unwrap_or(false);
        if !active {
            return Err(AppError::Internal(
                "Daemon 服务安装后未能正常启动，请检查远程主机日志".to_string()
            ));
        }
    }

    // 远程安装时 daemon_url 使用 SSH host，本地使用 127.0.0.1
    let daemon_url = if let Some(tgt) = ssh_target {
        let host = tgt.split('@').last().unwrap_or("127.0.0.1");
        format!("http://{}:{}", host, port)
    } else {
        format!("http://127.0.0.1:{}", port)
    };

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
        let daemon_path = dirs::home_dir().unwrap().join(".clawpilot/bin/clawpilot-daemon");
        let plist = generate_launchd_plist(&daemon_path.display().to_string(), 16668);
        assert!(plist.contains("com.clawpilot.daemon"));
        assert!(plist.contains("127.0.0.1:16668"));
        assert!(plist.contains(".clawpilot/bin/clawpilot-daemon"));
    }

    #[test]
    fn test_generate_systemd_service() {
        let daemon_path = dirs::home_dir().unwrap().join(".clawpilot/bin/clawpilot-daemon");
        let service = generate_systemd_service(&daemon_path.display().to_string(), 16668);
        assert!(service.contains("ClawPilot Daemon"));
        assert!(service.contains("127.0.0.1:16668"));
        assert!(service.contains("WantedBy=default.target"));
        assert!(service.contains(".clawpilot/bin/clawpilot-daemon"));
    }

    #[test]
    fn test_generate_api_key() {
        let key = generate_api_key();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_arch_from_uname() {
        assert_eq!(Arch::from_uname("arm64"), Arch::Arm64);
        assert_eq!(Arch::from_uname("aarch64"), Arch::Arm64);
        assert_eq!(Arch::from_uname("x86_64"), Arch::X64);
        assert_eq!(Arch::from_uname("amd64"), Arch::X64);
    }

    #[test]
    fn test_os_resource_suffix() {
        assert_eq!(OsType::MacOS.resource_suffix(), "macos");
        assert_eq!(OsType::Linux.resource_suffix(), "linux");
    }

    #[test]
    fn test_arch_resource_suffix() {
        assert_eq!(Arch::Arm64.resource_suffix(), "arm64");
        assert_eq!(Arch::X64.resource_suffix(), "x64");
    }
}
