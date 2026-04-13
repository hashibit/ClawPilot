use std::process::Command;
use std::fs;

use crate::error::{AppError, Result};

use super::platform::{
    get_daemon_bin_dir, resolve_daemon_binary, extract_ssh_key_arg, extract_ssh_port,
    OsType, Arch,
};
use super::decoration::{
    install_launchd_agent, install_launchd_agent_remote,
    install_systemd_user_service, install_systemd_user_service_remote,
};
use super::types::DaemonInstallResult;

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
        resolve_daemon_binary(&temp_path, target_os, target_arch)?;

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
        // 本地安装：从 bundle 复制，或从 GitHub Releases 下载
        resolve_daemon_binary(&daemon_path, target_os, target_arch)?;
        Ok(daemon_path.display().to_string())
    }
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

    // 5. 安装系统服务（原第6步）
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
        error: None,
    })
}
