/// openclaw/process.rs
/// OpenClaw 进程检测、启动、停止与配置重载
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

/// 进程状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProcessState {
    Running,
    Stopped,
    Unknown,
}

/// 进程信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub state: ProcessState,
    pub pid: Option<u32>,
    pub uptime_secs: Option<u64>,
}

/// 检测 openclaw 进程是否在运行
pub fn get_process_info() -> ProcessInfo {
    // 先尝试通过 pid 文件检测
    if let Some(pid) = read_pid_file() {
        if is_pid_running(pid) {
            return ProcessInfo {
                state: ProcessState::Running,
                pid: Some(pid),
                uptime_secs: get_process_uptime(pid),
            };
        }
    }

    // 再通过进程名检测
    if let Some(pid) = find_process_by_name() {
        return ProcessInfo {
            state: ProcessState::Running,
            pid: Some(pid),
            uptime_secs: get_process_uptime(pid),
        };
    }

    ProcessInfo {
        state: ProcessState::Stopped,
        pid: None,
        uptime_secs: None,
    }
}

/// 启动 openclaw 进程
pub fn start_openclaw(opc_name: &str) -> Result<u32> {
    let openclaw_bin = find_openclaw_binary()?;
    let child = Command::new(&openclaw_bin)
        .arg("start")
        .arg("--opc")
        .arg(opc_name)
        .arg("--daemon")
        .spawn()
        .map_err(|e| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("启动 openclaw 失败: {}", e),
            ))
        })?;
    Ok(child.id())
}

/// 停止 openclaw 进程
pub fn stop_openclaw() -> Result<()> {
    let info = get_process_info();
    match info.pid {
        Some(pid) => {
            #[cfg(unix)]
            {
                let _ = Command::new("kill").arg("-TERM").arg(pid.to_string()).status();
                Ok(())
            }
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .status();
                Ok(())
            }
        }
        None => Err(AppError::NotFound("OpenClaw 进程未运行".to_string())),
    }
}

/// 重载配置（向进程发送 SIGHUP）
pub fn reload_config() -> Result<()> {
    let info = get_process_info();
    match info.pid {
        Some(pid) => {
            #[cfg(unix)]
            {
                let status = Command::new("kill")
                    .arg("-HUP")
                    .arg(pid.to_string())
                    .status()
                    .map_err(AppError::Io)?;
                if status.success() {
                    Ok(())
                } else {
                    Err(AppError::Validation("发送 SIGHUP 失败".to_string()))
                }
            }
            #[cfg(windows)]
            {
                // Windows 不支持 SIGHUP，改为重启
                stop_openclaw()?;
                // 调用者负责重新 start
                Ok(())
            }
        }
        None => Err(AppError::NotFound("OpenClaw 进程未运行，无法重载".to_string())),
    }
}

// ─── 内部辅助函数 ─────────────────────────────────────────────────────────────

fn find_openclaw_binary() -> Result<std::path::PathBuf> {
    // 按优先级查找 openclaw 可执行文件
    let candidates = [
        // PATH 中的全局安装
        "openclaw",
        // 常见安装路径（macOS homebrew）
        "/opt/homebrew/bin/openclaw",
        "/usr/local/bin/openclaw",
        // Windows
        r"C:\Program Files\OpenClaw\openclaw.exe",
    ];

    for candidate in candidates {
        let path = std::path::Path::new(candidate);
        if path.is_absolute() {
            if path.exists() {
                return Ok(path.to_path_buf());
            }
        } else {
            // 通过 which/where 查找
            #[cfg(unix)]
            if let Ok(output) = Command::new("which").arg(candidate).output() {
                if output.status.success() {
                    let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !p.is_empty() {
                        return Ok(std::path::PathBuf::from(p));
                    }
                }
            }
            #[cfg(windows)]
            if let Ok(output) = Command::new("where").arg(candidate).output() {
                if output.status.success() {
                    let p = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !p.is_empty() {
                        return Ok(std::path::PathBuf::from(p));
                    }
                }
            }
        }
    }

    Err(AppError::NotFound(
        "未找到 openclaw 可执行文件，请先安装 OpenClaw".to_string(),
    ))
}

fn read_pid_file() -> Option<u32> {
    let pid_file = dirs::home_dir()?.join(".openclaw").join("openclaw.pid");
    let content = std::fs::read_to_string(pid_file).ok()?;
    content.trim().parse().ok()
}

fn is_pid_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill -0 只检查进程是否存在，不发送信号
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
}

fn find_process_by_name() -> Option<u32> {
    #[cfg(unix)]
    {
        let output = Command::new("pgrep").arg("-x").arg("openclaw").output().ok()?;
        if output.status.success() {
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .lines()
                .next()?
                .trim()
                .parse()
                .ok()
        } else {
            None
        }
    }
    #[cfg(windows)]
    {
        let output = Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq openclaw.exe", "/NH", "/FO", "CSV"])
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        // CSV 格式："openclaw.exe","12345",...
        stdout.lines().next().and_then(|line| {
            let parts: Vec<&str> = line.split(',').collect();
            parts.get(1)?.trim_matches('"').parse().ok()
        })
    }
}

fn get_process_uptime(pid: u32) -> Option<u64> {
    #[cfg(unix)]
    {
        // ps -p PID -o etimes= 返回进程启动后的秒数
        let output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "etimes="])
            .output()
            .ok()?;
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .ok()
    }
    #[cfg(windows)]
    {
        None // Windows 实现较复杂，暂留 None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_process_info_returns_info() {
        let info = get_process_info();
        // 不论运行状态，必须返回有效的 ProcessInfo
        assert!(matches!(
            info.state,
            ProcessState::Running | ProcessState::Stopped | ProcessState::Unknown
        ));
    }
}
