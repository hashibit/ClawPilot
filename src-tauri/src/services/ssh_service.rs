//! SSH service for remote server operations
//!
//! Provides SSH connection, authentication testing, and remote execution capabilities.

use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

use ssh2::Session;

use crate::error::{AppError, Result};

/// SSH connection configuration
#[derive(Debug, Clone)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: SshAuthType,
}

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

/// Result of remote command execution
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RemoteExecResult {
    pub ok: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
}

/// Test TCP connection to host:port
pub fn test_tcp_connection(host: &str, port: u16, timeout_secs: u64) -> ConnectionTestResult {
    let start = std::time::Instant::now();

    match TcpStream::connect_timeout(&format!("{}:{}", host, port).parse().unwrap_or_else(|_| {
        // Fallback for invalid address
        std::net::SocketAddrV4::new(
            host.parse().unwrap_or_else(|_| std::net::Ipv4Addr::new(0, 0, 0, 0)),
            port,
        )
        .into()
    }), Duration::from_secs(timeout_secs)) {
        Ok(_) => ConnectionTestResult {
            ok: true,
            latency_ms: start.elapsed().as_millis() as u64,
            error: None,
        },
        Err(e) => ConnectionTestResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("连接失败：{}", e)),
        },
    }
}

/// Test SSH authentication with password
pub fn test_ssh_password(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    timeout_secs: u64,
) -> AuthTestResult {
    let start = std::time::Instant::now();

    // First test TCP connection
    let tcp_stream = match TcpStream::connect_timeout(
        &format!("{}:{}", host, port).parse::<std::net::SocketAddr>().unwrap_or_else(|_| {
            format!("127.0.0.1:{}", port).parse().unwrap()
        }),
        Duration::from_secs(timeout_secs),
    ) {
        Ok(s) => s,
        Err(e) => {
            return AuthTestResult {
                ok: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error: Some(format!("无法连接到主机：{}", e)),
                message: None,
            };
        }
    };

    tcp_stream.set_read_timeout(Some(Duration::from_secs(timeout_secs))).ok();
    tcp_stream.set_write_timeout(Some(Duration::from_secs(timeout_secs))).ok();

    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp_stream);

    match sess.handshake() {
        Ok(_) => {
            match sess.userauth_password(username, password) {
                Ok(_) => {
                    // Try to execute a simple command to verify auth works
                    match sess.channel_session() {
                        Ok(mut channel) => {
                            match channel.exec("exit") {
                                Ok(_) => {
                                    channel.wait_eof().ok();
                                    channel.close().ok();
                                    channel.wait_close().ok();
                                    AuthTestResult {
                                        ok: true,
                                        latency_ms: start.elapsed().as_millis() as u64,
                                        error: None,
                                        message: Some("SSH 认证成功".into()),
                                    }
                                }
                                Err(e) => AuthTestResult {
                                    ok: false,
                                    latency_ms: start.elapsed().as_millis() as u64,
                                    error: Some(format!("执行命令失败：{}", e)),
                                    message: None,
                                },
                            }
                        }
                        Err(e) => AuthTestResult {
                            ok: false,
                            latency_ms: start.elapsed().as_millis() as u64,
                            error: Some(format!("无法创建 SSH 通道：{}", e)),
                            message: None,
                        },
                    }
                }
                Err(e) => AuthTestResult {
                    ok: false,
                    latency_ms: start.elapsed().as_millis() as u64,
                    error: Some(format!("认证失败：{}", e)),
                    message: None,
                },
            }
        }
        Err(e) => AuthTestResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("SSH 握手失败：{}", e)),
            message: None,
        },
    }
}

/// Test SSH authentication with key
pub fn test_ssh_key(
    host: &str,
    port: u16,
    username: &str,
    key_path: &str,
    timeout_secs: u64,
) -> AuthTestResult {
    let start = std::time::Instant::now();

    // Expand ~ to home directory
    let expanded_path = if key_path.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            key_path.replacen('~', &home.to_string_lossy(), 1)
        } else {
            key_path.to_string()
        }
    } else {
        key_path.to_string()
    };

    // Check if key file exists
    if !Path::new(&expanded_path).exists() {
        return AuthTestResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            error: Some("SSH 密钥文件不存在".into()),
            message: None,
        };
    }

    // Test TCP connection first
    let tcp_stream = match TcpStream::connect_timeout(
        &format!("{}:{}", host, port).parse::<std::net::SocketAddr>().unwrap_or_else(|_| {
            format!("127.0.0.1:{}", port).parse().unwrap()
        }),
        Duration::from_secs(timeout_secs),
    ) {
        Ok(s) => s,
        Err(e) => {
            return AuthTestResult {
                ok: false,
                latency_ms: start.elapsed().as_millis() as u64,
                error: Some(format!("无法连接到主机：{}", e)),
                message: None,
            };
        }
    };

    tcp_stream.set_read_timeout(Some(Duration::from_secs(timeout_secs))).ok();
    tcp_stream.set_write_timeout(Some(Duration::from_secs(timeout_secs))).ok();

    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp_stream);

    match sess.handshake() {
        Ok(_) => {
            // Try public key authentication
            // Signature: userauth_pubkey_file(&self, username: &str, privatekey: Option<&Path>, pubkey: Option<&Path>, passphrase: Option<&str>)
            match sess.userauth_pubkey_file(username, None, Path::new(&expanded_path), None) {
                Ok(_) => AuthTestResult {
                    ok: true,
                    latency_ms: start.elapsed().as_millis() as u64,
                    error: None,
                    message: Some("SSH 密钥认证成功".into()),
                },
                Err(e) => AuthTestResult {
                    ok: false,
                    latency_ms: start.elapsed().as_millis() as u64,
                    error: Some(format!("密钥认证失败：{}", e)),
                    message: None,
                },
            }
        }
        Err(e) => AuthTestResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("SSH 握手失败：{}", e)),
            message: None,
        },
    }
}

/// Execute a remote command via SSH
pub fn execute_remote_command(
    host: &str,
    port: u16,
    username: &str,
    auth: &SshAuthType,
    command: &str,
    timeout_secs: u64,
) -> Result<RemoteExecResult> {
    // Connect based on auth type
    let tcp_stream = TcpStream::connect_timeout(
        &format!("{}:{}", host, port).parse::<std::net::SocketAddr>().unwrap_or_else(|_| {
            format!("127.0.0.1:{}", port).parse().unwrap()
        }),
        Duration::from_secs(timeout_secs),
    ).map_err(|e| AppError::Validation(format!("无法连接到主机：{}", e)))?;

    tcp_stream.set_read_timeout(Some(Duration::from_secs(timeout_secs))).ok();
    tcp_stream.set_write_timeout(Some(Duration::from_secs(timeout_secs))).ok();

    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp_stream);
    sess.handshake().map_err(|e| AppError::Validation(format!("SSH 握手失败：{}", e)))?;

    // Authenticate
    match auth {
        SshAuthType::Password(pwd) => {
            sess.userauth_password(username, pwd)
                .map_err(|e| AppError::Validation(format!("认证失败：{}", e)))?;
        }
        SshAuthType::Key { key_path, .. } => {
            let expanded_path = if key_path.starts_with('~') {
                if let Some(home) = dirs::home_dir() {
                    key_path.replacen('~', &home.to_string_lossy(), 1)
                } else {
                    key_path.clone()
                }
            } else {
                key_path.clone()
            };
            sess.userauth_pubkey_file(username, None, Path::new(&expanded_path), None)
                .map_err(|e| AppError::Validation(format!("密钥认证失败：{}", e)))?;
        }
    }

    // Execute command
    let mut channel = sess.channel_session()
        .map_err(|e| AppError::Validation(format!("无法创建通道：{}", e)))?;

    channel.exec(command)
        .map_err(|e| AppError::Validation(format!("执行命令失败：{}", e)))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    std::io::Read::read_to_string(&mut channel, &mut stdout).ok();
    std::io::Read::read_to_string(&mut channel.stderr(), &mut stderr).ok();

    channel.wait_eof().ok();
    channel.close().ok();
    channel.wait_close().ok();

    let exit_code = channel.exit_status().unwrap_or(-1);

    Ok(RemoteExecResult {
        ok: exit_code == 0,
        exit_code,
        stdout,
        stderr: stderr.clone(),
        error: if exit_code != 0 { Some(stderr) } else { None },
    })
}

/// Upload a file to remote server via SCP
pub fn upload_file(
    host: &str,
    port: u16,
    username: &str,
    auth: &SshAuthType,
    local_path: &str,
    remote_path: &str,
    timeout_secs: u64,
) -> Result<()> {
    // Connect
    let tcp_stream = TcpStream::connect_timeout(
        &format!("{}:{}", host, port).parse::<std::net::SocketAddr>().unwrap_or_else(|_| {
            format!("127.0.0.1:{}", port).parse().unwrap()
        }),
        Duration::from_secs(timeout_secs),
    ).map_err(|e| AppError::Validation(format!("无法连接到主机：{}", e)))?;

    tcp_stream.set_read_timeout(Some(Duration::from_secs(timeout_secs))).ok();
    tcp_stream.set_write_timeout(Some(Duration::from_secs(timeout_secs))).ok();

    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp_stream);
    sess.handshake().map_err(|e| AppError::Validation(format!("SSH 握手失败：{}", e)))?;

    // Authenticate
    match auth {
        SshAuthType::Password(pwd) => {
            sess.userauth_password(username, pwd)
                .map_err(|e| AppError::Validation(format!("认证失败：{}", e)))?;
        }
        SshAuthType::Key { key_path, .. } => {
            let expanded_path = if key_path.starts_with('~') {
                if let Some(home) = dirs::home_dir() {
                    key_path.replacen('~', &home.to_string_lossy(), 1)
                } else {
                    key_path.clone()
                }
            } else {
                key_path.clone()
            };
            sess.userauth_pubkey_file(username, None, Path::new(&expanded_path), None)
                .map_err(|e| AppError::Validation(format!("密钥认证失败：{}", e)))?;
        }
    }

    // Read local file
    let file_content = std::fs::read(local_path)
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, format!("读取文件失败：{}", e))))?;

    // Upload via SFTP
    let sftp = sess.sftp()
        .map_err(|e| AppError::Validation(format!("SFTP 初始化失败：{}", e)))?;

    let mut remote_file = sftp.create(Path::new(remote_path))
        .map_err(|e| AppError::Validation(format!("SFTP 创建文件失败：{}", e)))?;

    std::io::Write::write_all(&mut remote_file, &file_content)
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("写入失败：{}", e))))?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // --- SshConfig 测试 ---
    #[test]
    fn test_ssh_config() {
        let config = SshConfig {
            host: "192.168.1.1".to_string(),
            port: 22,
            username: "root".to_string(),
            auth_type: SshAuthType::Password("secret".to_string()),
        };

        assert_eq!(config.host, "192.168.1.1");
        assert_eq!(config.port, 22);
        assert_eq!(config.username, "root");
    }

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

    // --- ConnectionTestResult 测试 ---
    #[test]
    fn test_connection_test_result_serde() {
        let result = ConnectionTestResult {
            ok: true,
            latency_ms: 42,
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: ConnectionTestResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.latency_ms, parsed.latency_ms);
        assert_eq!(result.error, parsed.error);
    }

    #[test]
    fn test_connection_test_result_error() {
        let result = ConnectionTestResult {
            ok: false,
            latency_ms: 0,
            error: Some("Connection refused".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: ConnectionTestResult = serde_json::from_str(&json).unwrap();

        assert!(!parsed.ok);
        assert_eq!(parsed.error, Some("Connection refused".to_string()));
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

    // --- RemoteExecResult 测试 ---
    #[test]
    fn test_remote_exec_result_serde() {
        let result = RemoteExecResult {
            ok: true,
            exit_code: 0,
            stdout: "output".to_string(),
            stderr: String::new(),
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: RemoteExecResult = serde_json::from_str(&json).unwrap();

        assert!(parsed.ok);
        assert_eq!(parsed.exit_code, 0);
        assert_eq!(parsed.stdout, "output");
    }

    #[test]
    fn test_remote_exec_result_with_error() {
        let result = RemoteExecResult {
            ok: false,
            exit_code: 1,
            stdout: String::new(),
            stderr: "error output".to_string(),
            error: Some("error output".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: RemoteExecResult = serde_json::from_str(&json).unwrap();

        assert!(!parsed.ok);
        assert_eq!(parsed.exit_code, 1);
        assert_eq!(parsed.stderr, "error output");
    }

    // --- test_tcp_connection 测试 ---
    #[test]
    fn test_tcp_connection_invalid_host() {
        // Testing with an obviously invalid host that will fail
        let result = test_tcp_connection("0.0.0.0", 1, 1);

        // Should fail (or timeout) since nothing is listening
        assert!(!result.ok || result.error.is_some());
    }

    // --- 边界条件测试 ---
    #[test]
    fn test_ssh_config_default_port() {
        // SSH default port is 22
        let config = SshConfig {
            host: "localhost".to_string(),
            port: 22, // default SSH port
            username: "root".to_string(),
            auth_type: SshAuthType::Password("".to_string()),
        };

        assert_eq!(config.port, 22);
    }

    #[test]
    fn test_connection_test_result_latency() {
        let result = ConnectionTestResult {
            ok: true,
            latency_ms: 1000, // 1 second
            error: None,
        };

        assert!(result.latency_ms > 0);
    }
}
