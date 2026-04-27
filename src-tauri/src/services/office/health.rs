use crate::database::pool::DbPool;
use crate::models::office::DaemonHealthResult;

use super::crud::update_office_daemon_url;

/// Result of probing for a daemon
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProbeDaemonResult {
    pub ok: bool,
    pub daemon_url: Option<String>,
}

/// openclaw_bin_paths: optional (node_bin, openclaw_bin) to pass as query params to daemon
pub async fn check_daemon_health(
    daemon_url: &str,
    openclaw_bin_paths: Option<(&str, &str)>,
) -> DaemonHealthResult {
    if daemon_url.is_empty() {
        return DaemonHealthResult {
            ok: false,
            error: Some("未配置 Daemon URL".into()),
            ..Default::default()
        };
    }

    let mut url = format!("{}/health", daemon_url.trim_end_matches('/'));
    if let Some((node_bin, openclaw_bin)) = openclaw_bin_paths {
        // Percent-encode only the path values (spaces, special chars)
        fn pct_encode(s: &str) -> String {
            s.bytes().map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
                | b'-' | b'_' | b'.' | b'~' | b'/' => (b as char).to_string(),
                _ => format!("%{:02X}", b),
            }).collect()
        }
        url = format!("{}?node_bin={}&openclaw_bin={}",
            url, pct_encode(node_bin), pct_encode(openclaw_bin));
    }
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DaemonHealthResult {
                ok: false,
                error: Some(e.to_string()),
                ..Default::default()
            }
        }
    };

    // A7: present Bearer token to local daemon. Remote daemons (no shared
    // token file) will see this as a stale credential and reject — that is
    // currently a known limitation; remote daemon access is not part of the
    // supported topology for the embedded HTTP path.
    let mut req = client.get(&url);
    if let Some(bearer) = crate::utils::daemon_token::bearer_header_value() {
        req = req.header(reqwest::header::AUTHORIZATION, bearer);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
            Ok(json) => DaemonHealthResult {
                ok: true,
                not_installed: None,
                status: json["status"].as_str().map(String::from),
                version: json["version"].as_str().map(String::from),
                openclaw_version: json["openclaw_version"].as_str().map(String::from),
                openclaw_status: json["openclaw_status"].as_str().map(String::from),
                openclaw_pid: json["openclaw_pid"].as_u64().map(|v| v as u32),
                platform: json["platform"].as_str().map(String::from),
                arch: json["arch"].as_str().map(String::from),
                active_tasks: json["active_tasks"].as_u64(),
                error: None,
            },
            Err(e) => DaemonHealthResult {
                ok: false,
                error: Some(e.to_string()),
                ..Default::default()
            },
        },
        Ok(resp) => DaemonHealthResult {
            ok: false,
            error: Some(format!("HTTP {}", resp.status())),
            ..Default::default()
        },
        Err(e) => {
            let msg = e.to_string();
            let not_installed = msg.contains("connection refused")
                || msg.contains("Connection refused")
                || msg.contains("timed out")
                || msg.contains("timeout")
                || msg.contains("os error 61")
                || msg.contains("os error 111");
            DaemonHealthResult {
                ok: false,
                error: Some(msg),
                not_installed: if not_installed { Some(true) } else { None },
                ..Default::default()
            }
        }
    }
}

/// Probe local daemon for running daemon on common ports
pub async fn probe_local_daemon(pool: &DbPool, office_id: Option<&str>) -> ProbeDaemonResult {
    let ports = [16668u16];

    for port in &ports {
        let url = format!("http://127.0.0.1:{}", port);
        match check_daemon_health(&url, None).await {
            result if result.ok => {
                // If office_id is provided, save the daemon url
                if let Some(oid) = office_id {
                    let _ = update_office_daemon_url(pool, oid, &url);
                }

                return ProbeDaemonResult {
                    ok: true,
                    daemon_url: Some(url),
                };
            }
            _ => continue,
        }
    }

    ProbeDaemonResult {
        ok: false,
        daemon_url: None,
    }
}

/// Probe remote daemon via SSH
pub async fn probe_remote_daemon(pool: &DbPool, office_id: &str) -> ProbeDaemonResult {
    use crate::utils::crypto::decrypt;

    // First, get office info from DB (don't hold connection across await)
    let office_data = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(_) => {
                return ProbeDaemonResult {
                    ok: false,
                    daemon_url: None,
                }
            }
        };

        // Get office info
        let office_info: Option<(String, Option<String>, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT address, access_user, access_password, ssh_key_path FROM offices WHERE id = ?1",
                rusqlite::params![office_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .ok();

        office_info
    };

    let (address, access_user, access_password_enc, ssh_key_path) = match office_data {
        Some(info) => info,
        None => {
            return ProbeDaemonResult {
                ok: false,
                daemon_url: None,
            }
        }
    };

    // Parse address - must be IP or IP:port
    let addr_trimmed = address.trim();
    let (host, port) = if let Some(idx) = addr_trimmed.find(':') {
        let port_str = &addr_trimmed[idx + 1..];
        let port = port_str.parse().unwrap_or(22);
        (addr_trimmed[..idx].to_string(), port)
    } else {
        (addr_trimmed.to_string(), 22)
    };

    // Validate IP format
    let octets: Vec<&str> = host.split('.').collect();
    if octets.len() != 4 || octets.iter().any(|o| o.parse::<u8>().is_err()) {
        return ProbeDaemonResult {
            ok: false,
            daemon_url: None,
        };
    }

    let ssh_user = access_user.as_deref().unwrap_or("root");

    // Build SSH command prefix
    let ssh_prefix: String;
    let ssh_prefix_with_pass: Option<String>;

    // ssh_key_path may be stored encrypted (enc:...) per A1 rework. Decrypt
    // before use; if it's stored as legacy plaintext just keep the value.
    let ssh_key_path_plain: Option<String> = ssh_key_path.as_ref().map(|raw| {
        if raw.starts_with("enc:") {
            decrypt(raw).unwrap_or_default()
        } else {
            raw.clone()
        }
    });

    if let Some(key_path) = &ssh_key_path_plain {
        let expanded_path = if key_path.starts_with("~/") {
            if let Some(home) = dirs::home_dir() {
                home.join(&key_path[2..]).to_string_lossy().to_string()
            } else {
                key_path.clone()
            }
        } else {
            key_path.clone()
        };
        ssh_prefix = format!(
            "ssh -i \"{}\" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 -p {}",
            expanded_path, port
        );
        ssh_prefix_with_pass = None;
    } else if let Some(pass_enc) = &access_password_enc {
        if let Ok(pass) = decrypt(pass_enc) {
            let escaped = pass.replace('\'', "'\\''");
            ssh_prefix = format!(
                "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p {}",
                port
            );
            ssh_prefix_with_pass = Some(format!("sshpass -p '{}' {}", escaped, ssh_prefix));
        } else {
            return ProbeDaemonResult {
                ok: false,
                daemon_url: None,
            };
        }
    } else {
        return ProbeDaemonResult {
            ok: false,
            daemon_url: None,
        };
    };

    let target = format!("{}@{}", ssh_user, host);

    // Probe common daemon ports
    let daemon_ports = [16668u16];
    let mut found_port: Option<u16> = None;

    for dp in &daemon_ports {
        let check_cmd = format!(
            "{} {} \"curl -sf http://127.0.0.1:{}/health > /dev/null 2>&1 && echo ok\"",
            ssh_prefix_with_pass.as_ref().unwrap_or(&ssh_prefix),
            target,
            dp
        );

        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&check_cmd)
            .output()
            .await;

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout == "ok" {
                found_port = Some(*dp);
                break;
            }
        }
    }

    let found_port = match found_port {
        Some(p) => p,
        None => {
            return ProbeDaemonResult {
                ok: false,
                daemon_url: None,
            }
        }
    };

    let daemon_url = format!("http://{}:{}", host, found_port);

    // Update office daemon url
    let _ = update_office_daemon_url(pool, office_id, &daemon_url);

    ProbeDaemonResult {
        ok: true,
        daemon_url: Some(daemon_url),
    }
}
