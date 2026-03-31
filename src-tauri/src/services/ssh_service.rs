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
