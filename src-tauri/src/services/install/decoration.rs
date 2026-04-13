use std::process::Command;
use std::fs;

use crate::error::{AppError, Result};

/// 获取当前用户 UID（通过 id -u，不依赖 UID 环境变量）
pub fn get_uid() -> Result<String> {
    let output = Command::new("id").arg("-u").output()?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 生成 macOS launchd plist 内容
pub fn generate_launchd_plist(daemon_path: &str, port: u16) -> String {
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
pub fn generate_systemd_service(daemon_path: &str, port: u16) -> String {
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
pub fn install_launchd_agent(daemon_path: &str, port: u16) -> Result<()> {
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
pub fn install_systemd_user_service(daemon_path: &str, port: u16) -> Result<()> {
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
pub fn install_launchd_agent_remote(
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
pub fn generate_systemd_service_remote(port: u16) -> String {
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
pub fn install_systemd_user_service_remote(
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
