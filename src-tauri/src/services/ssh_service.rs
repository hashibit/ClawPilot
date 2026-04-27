//! SSH service for remote server operations using system ssh command
//!
//! Provides SSH connection and authentication testing capabilities.
//! Uses system ssh command instead of ssh2 crate for better network compatibility
//! (especially for OrbStack and other virtual network configurations).
//!
//! All commands are executed via `std::process::Command` argv form so the local
//! shell is never involved — this prevents shell injection from any field
//! (host / username / key_path / password / remote cmd).

use std::path::Path;
use std::process::Command;

/// SSH authentication type
#[derive(Debug, Clone)]
pub enum SshAuthType {
    Password(String),
    Key { key_path: String, passphrase: Option<String> },
}

/// Result of SSH connection test
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

/// Result of SSH authentication test
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
    pub message: Option<String>,
}

/// Build the canonical ssh argv (without the trailing remote command).
///
/// Returns a vec like `["-o", "...", "-p", "22", "-i", "/key", "user@host"]`.
/// Caller appends the remote command as a single additional arg.
fn build_ssh_args(
    host: &str,
    port: u16,
    username: &str,
    key_path: Option<&str>,
    timeout_secs: u64,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-o".into(), "StrictHostKeyChecking=no".into(),
        "-o".into(), "BatchMode=yes".into(),
        "-o".into(), format!("ConnectTimeout={timeout_secs}"),
        "-o".into(), "LogLevel=ERROR".into(),
        "-p".into(), port.to_string(),
    ];
    if let Some(key) = key_path {
        let expanded = expand_tilde(key);
        args.push("-i".into());
        args.push(expanded);
    }
    args.push(format!("{username}@{host}"));
    args
}

/// Run an SSH command and return stdout
pub fn run_ssh_command(
    host: &str,
    port: u16,
    username: &str,
    key_path: Option<&str>,
    cmd: &str,
    timeout_secs: u64,
) -> Result<String, String> {
    let mut args = build_ssh_args(host, port, username, key_path, timeout_secs);
    args.push(cmd.to_string());

    let output = Command::new("ssh")
        .args(&args)
        .output()
        .map_err(|e| format!("执行 SSH 命令失败：{e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("命令执行失败：{stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Expand ~ in path to home directory
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

/// Test SSH connection using system ssh command
pub fn test_ssh_connection(
    host: &str,
    port: u16,
    username: &str,
    key_path: Option<&str>,
    timeout_secs: u64,
) -> AuthTestResult {
    let start = std::time::Instant::now();

    let mut args = build_ssh_args(host, port, username, key_path, timeout_secs.max(5));
    args.push("exit".into());

    let output = Command::new("ssh").args(&args).output();

    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Ok(out) => {
            if out.status.success() {
                AuthTestResult {
                    ok: true,
                    latency_ms: elapsed,
                    error: None,
                    message: Some("SSH 连接成功".into()),
                }
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                AuthTestResult {
                    ok: false,
                    latency_ms: elapsed,
                    error: Some(format!("SSH 连接失败：{}", stderr.trim())),
                    message: None,
                }
            }
        }
        Err(e) => AuthTestResult {
            ok: false,
            latency_ms: elapsed,
            error: Some(format!("执行 SSH 命令失败：{}", e)),
            message: None,
        },
    }
}

/// Test SSH authentication with key using system ssh command
pub fn test_ssh_key(
    host: &str,
    port: u16,
    username: &str,
    key_path: &str,
    timeout_secs: u64,
) -> AuthTestResult {
    let start = std::time::Instant::now();

    // Expand ~ to home directory
    let expanded_path = expand_tilde(key_path);

    // Check if key file exists
    if !Path::new(&expanded_path).exists() {
        return AuthTestResult {
            ok: false,
            latency_ms: 0,
            error: Some("SSH 密钥文件不存在".into()),
            message: None,
        };
    }

    let mut args = build_ssh_args(host, port, username, Some(&expanded_path), timeout_secs.max(5));
    args.push("whoami".into());

    let output = Command::new("ssh").args(&args).output();

    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Ok(out) => {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                AuthTestResult {
                    ok: true,
                    latency_ms: elapsed,
                    error: None,
                    message: Some(format!("SSH 密钥认证成功 (用户：{})", stdout)),
                }
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                AuthTestResult {
                    ok: false,
                    latency_ms: elapsed,
                    error: Some(format!("SSH 认证失败：{}", stderr.trim())),
                    message: None,
                }
            }
        }
        Err(e) => AuthTestResult {
            ok: false,
            latency_ms: elapsed,
            error: Some(format!("执行 SSH 命令失败：{}", e)),
            message: None,
        },
    }
}

/// Test SSH authentication with password using system ssh command and sshpass
pub fn test_ssh_password(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    timeout_secs: u64,
) -> AuthTestResult {
    let start = std::time::Instant::now();

    // sshpass argv form — password is a single arg, never reaches a shell
    let mut args: Vec<String> = vec!["-p".into(), password.to_string(), "ssh".into()];
    args.extend(build_ssh_args(host, port, username, None, timeout_secs.max(5)));
    // Note: BatchMode=yes is set by build_ssh_args which would normally disable
    // password prompts. Override here so sshpass can supply the password.
    args.push("-o".into());
    args.push("BatchMode=no".into());
    args.push("whoami".into());

    let output = Command::new("sshpass").args(&args).output();

    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Ok(out) => {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                AuthTestResult {
                    ok: true,
                    latency_ms: elapsed,
                    error: None,
                    message: Some(format!("SSH 密码认证成功 (用户：{})", stdout)),
                }
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let error_msg = stderr.trim();

                // Check for common error patterns
                let error_msg = if error_msg.contains("Permission denied") {
                    "认证失败：权限被拒绝（用户名或密码错误）".to_string()
                } else if error_msg.contains("sshpass") {
                    "sshpass 未安装，请使用密钥认证或安装 sshpass".to_string()
                } else {
                    format!("SSH 认证失败：{}", error_msg)
                };

                AuthTestResult {
                    ok: false,
                    latency_ms: elapsed,
                    error: Some(error_msg),
                    message: None,
                }
            }
        }
        Err(e) => {
            // Detect missing sshpass binary
            if e.kind() == std::io::ErrorKind::NotFound {
                return AuthTestResult {
                    ok: false,
                    latency_ms: elapsed,
                    error: Some("sshpass 未安装，请使用密钥认证或安装 sshpass".into()),
                    message: None,
                };
            }
            AuthTestResult {
                ok: false,
                latency_ms: elapsed,
                error: Some(format!("执行 SSH 命令失败：{}", e)),
                message: None,
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // --- SshAuthType 测试 ---
    #[test]
    fn test_ssh_auth_type_password() {
        let auth = SshAuthType::Password("secret".to_string());

        match auth {
            SshAuthType::Password(pwd) => assert_eq!(pwd, "secret"),
            _ => panic!("Expected Password variant"),
        }
    }

    #[test]
    fn test_ssh_auth_type_key() {
        let auth = SshAuthType::Key {
            key_path: "~/.ssh/id_rsa".to_string(),
            passphrase: Some("passphrase".to_string()),
        };

        match auth {
            SshAuthType::Key { key_path, passphrase } => {
                assert_eq!(key_path, "~/.ssh/id_rsa");
                assert_eq!(passphrase, Some("passphrase".to_string()));
            }
            _ => panic!("Expected Key variant"),
        }
    }

    // --- AuthTestResult 测试 ---
    #[test]
    fn test_auth_test_result_serde() {
        let result = AuthTestResult {
            ok: true,
            latency_ms: 150,
            error: None,
            message: Some("SSH 认证成功".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: AuthTestResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.latency_ms, parsed.latency_ms);
        assert_eq!(result.message, parsed.message);
    }

    #[test]
    fn test_auth_test_result_failure() {
        let result = AuthTestResult {
            ok: false,
            latency_ms: 50,
            error: Some("认证失败：Permission denied".to_string()),
            message: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: AuthTestResult = serde_json::from_str(&json).unwrap();

        assert!(!parsed.ok);
        assert!(parsed.error.unwrap().contains("认证失败"));
    }

    // --- expand_tilde 测试 ---
    #[test]
    fn test_expand_tilde() {
        let home = dirs::home_dir().unwrap();
        let result = expand_tilde("~/test");
        assert!(result.starts_with(home.to_string_lossy().as_ref()));
        assert!(result.ends_with("test"));

        let result2 = expand_tilde("/absolute/path");
        assert_eq!(result2, "/absolute/path");
    }

    // --- build_ssh_args 测试 ---
    #[test]
    fn test_build_ssh_args_basic() {
        let args = build_ssh_args("192.168.1.1", 22, "root", None, 5);
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"22".to_string()));
        assert!(args.contains(&"root@192.168.1.1".to_string()));
        // No -i when key not provided
        assert!(!args.contains(&"-i".to_string()));
    }

    #[test]
    fn test_build_ssh_args_with_key() {
        let args = build_ssh_args("192.168.1.1", 2222, "user", Some("/tmp/key"), 5);
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"/tmp/key".to_string()));
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"2222".to_string()));
    }

    /// A2 regression: ensure that even a malicious username with shell metachars
    /// cannot escape the argv boundary. We only check the args structure here —
    /// since `Command::new("ssh").args()` passes argv directly to execve(),
    /// the local shell never sees these characters.
    #[test]
    fn test_build_ssh_args_no_shell_interpretation() {
        let evil = "user; rm -rf ~";
        let args = build_ssh_args("h", 22, evil, None, 5);
        // The malicious value sits intact as a single arg — execve() treats it
        // as a literal string, no shell parses it.
        assert!(args.iter().any(|a| a == &format!("{evil}@h")));
    }
}
