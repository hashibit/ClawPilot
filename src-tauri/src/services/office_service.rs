use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};

// ── helpers ──────────────────────────────────────────────────

fn row_to_office(row: &rusqlite::Row<'_>) -> rusqlite::Result<Office> {
    Ok(Office {
        id: row.get(0)?,
        name: row.get(1)?,
        address: row.get(2)?,
        access_card: row.get(3)?,
        phone: row.get(4)?,
        receptionist_image: row.get(5)?,
        ownership: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "RENTED".into()),
        monthly_rent: row.get(7)?,
        internet_speed: row.get(8)?,
        decoration_grade: row.get::<_, Option<String>>(9)?.unwrap_or_else(|| "MEDIUM".into()),
        description: row.get(10)?,
        daemon_url: row.get(11)?,
        daemon_api_key: row.get(12)?,
        opc_root: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        current_opc_id: row.get(16).ok().flatten(),
        current_opc_name: row.get(17).ok().flatten(),
    })
}

fn now() -> i64 {
    Utc::now().timestamp()
}

// ── queries ──────────────────────────────────────────────────

pub fn get_offices(pool: &DbPool) -> Result<Vec<Office>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT o.id, o.name, o.address, o.access_card, o.phone, o.receptionist_image,
                o.ownership, o.monthly_rent, o.internet_speed, o.decoration_grade,
                o.description, o.daemon_url, o.daemon_api_key, o.opc_root, o.created_at, o.updated_at,
                oc.id, oc.display_name
         FROM offices o
         LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
         ORDER BY o.created_at",
    )?;
    let rows = stmt
        .query_map([], row_to_office)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_office(pool: &DbPool, id: &str) -> Result<Office> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT o.id, o.name, o.address, o.access_card, o.phone, o.receptionist_image,
                o.ownership, o.monthly_rent, o.internet_speed, o.decoration_grade,
                o.description, o.daemon_url, o.daemon_api_key, o.opc_root, o.created_at, o.updated_at,
                oc.id, oc.display_name
         FROM offices o
         LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
         WHERE o.id = ?1",
        rusqlite::params![id],
        row_to_office,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn create_office(pool: &DbPool, office: &Office) -> Result<String> {
    let conn = pool.get()?;
    let ts = now();
    // Generate UUID if not provided
    let id = if office.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        office.id.clone()
    };
    conn.execute(
        "INSERT INTO offices
             (id, name, address, access_card, phone, receptionist_image,
              ownership, monthly_rent, internet_speed, decoration_grade,
              description, daemon_url, daemon_api_key, opc_root, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
        rusqlite::params![
            id,
            office.name,
            office.address,
            office.access_card,
            office.phone,
            office.receptionist_image,
            office.ownership,
            office.monthly_rent,
            office.internet_speed,
            office.decoration_grade,
            office.description,
            office.daemon_url,
            office.daemon_api_key,
            office.opc_root,
            office.created_at.max(1).min(i64::MAX - 1) + 0 * ts, // use provided or fallback
            office.updated_at,
        ],
    )?;
    Ok(id)
}

pub fn update_office(pool: &DbPool, id: &str, office: &Office) -> Result<()> {
    let conn = pool.get()?;
    let affected = conn.execute(
        "UPDATE offices SET
             name=?2, address=?3, access_card=?4, phone=?5, receptionist_image=?6,
             ownership=?7, monthly_rent=?8, internet_speed=?9, decoration_grade=?10,
             description=?11, daemon_url=?12, daemon_api_key=?13, opc_root=?14, updated_at=?15
         WHERE id=?1",
        rusqlite::params![
            id,
            office.name,
            office.address,
            office.access_card,
            office.phone,
            office.receptionist_image,
            office.ownership,
            office.monthly_rent,
            office.internet_speed,
            office.decoration_grade,
            office.description,
            office.daemon_url,
            office.daemon_api_key,
            office.opc_root,
            now(),
        ],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok(())
}

pub fn delete_office(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE opc_config SET office_id = NULL WHERE office_id = ?1",
        rusqlite::params![id],
    )?;
    conn.execute("DELETE FROM offices WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

pub fn assign_office(pool: &DbPool, opc_id: &str, office_id: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE opc_config SET office_id = ?2 WHERE id = ?1",
        rusqlite::params![opc_id, office_id],
    )?;
    Ok(())
}

pub fn get_opc_office(pool: &DbPool, opc_id: &str) -> Result<Option<Office>> {
    let conn = pool.get()?;
    let office_id: Option<String> = conn
        .query_row(
            "SELECT office_id FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| r.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(opc_id.to_string()),
            other => AppError::Database(other),
        })?;

    // Drop the connection lock before calling get_office to avoid deadlock
    drop(conn);

    match office_id {
        None => Ok(None),
        Some(oid) => get_office(pool, &oid).map(Some),
    }
}

pub fn get_office_deployments(
    pool: &DbPool,
    office_id: &str,
    limit: i64,
) -> Result<Vec<OfficeDeployment>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, opc_id, opc_name, office_id, office_name, deployed_at, undeployed_at, is_active
         FROM office_deployments
         WHERE office_id = ?1
         ORDER BY deployed_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![office_id, limit], |row| {
            Ok(OfficeDeployment {
                id: row.get(0)?,
                opc_id: row.get(1)?,
                opc_name: row.get(2)?,
                office_id: row.get(3)?,
                office_name: row.get(4)?,
                deployed_at: row.get(5)?,
                undeployed_at: row.get(6)?,
                is_active: row.get::<_, i64>(7)? != 0,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub async fn check_daemon_health(daemon_url: &str, api_key: &str) -> DaemonHealthResult {
    if daemon_url.is_empty() {
        return DaemonHealthResult {
            ok: false,
            error: Some("未配置 Daemon URL".into()),
            ..Default::default()
        };
    }

    let url = format!("{}/health", daemon_url.trim_end_matches('/'));
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

    match client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => DaemonHealthResult {
                    ok: true,
                    status: json["status"].as_str().map(String::from),
                    version: json["version"].as_str().map(String::from),
                    openclaw_status: json["openclaw_status"].as_str().map(String::from),
                    openclaw_pid: json["openclaw_pid"].as_u64().map(|v| v as u32),
                    active_tasks: json["active_tasks"].as_u64(),
                    error: None,
                },
                Err(e) => DaemonHealthResult {
                    ok: false,
                    error: Some(e.to_string()),
                    ..Default::default()
                },
            }
        }
        Ok(resp) => DaemonHealthResult {
            ok: false,
            error: Some(format!("HTTP {}", resp.status())),
            ..Default::default()
        },
        Err(e) => DaemonHealthResult {
            ok: false,
            error: Some(e.to_string()),
            ..Default::default()
        },
    }
}

/// Probe local daemon for running daemon on common ports
pub async fn probe_local_daemon(pool: &DbPool, office_id: Option<&str>) -> ProbeDaemonResult {
    let ports = [16668u16];

    for port in &ports {
        let url = format!("http://127.0.0.1:{}", port);
        match check_daemon_health(&url, "").await {
            result if result.ok => {
                // Found a running daemon, try to read API key
                let api_key = read_local_daemon_key();

                // If office_id is provided, save the daemon config
                if let Some(oid) = office_id {
                    if let Some(key) = &api_key {
                        let _ = update_office_daemon_config(pool, oid, &url, key);
                    }
                }

                return ProbeDaemonResult {
                    ok: true,
                    daemon_url: Some(url),
                    api_key,
                };
            }
            _ => continue,
        }
    }

    ProbeDaemonResult {
        ok: false,
        daemon_url: None,
        api_key: None,
    }
}

/// Probe remote daemon via SSH
pub async fn probe_remote_daemon(pool: &DbPool, office_id: &str) -> ProbeDaemonResult {
    use crate::utils::crypto::decrypt;

    // First, get office info from DB (don't hold connection across await)
    let office_data = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(_) => return ProbeDaemonResult { ok: false, daemon_url: None, api_key: None },
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
        None => return ProbeDaemonResult { ok: false, daemon_url: None, api_key: None },
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
            api_key: None,
        };
    }

    let ssh_user = access_user.as_deref().unwrap_or("root");

    // Build SSH command prefix
    let ssh_prefix: String;
    let ssh_prefix_with_pass: Option<String>;

    if let Some(key_path) = &ssh_key_path {
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
            ssh_prefix = format!("ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p {}", port);
            ssh_prefix_with_pass = Some(format!(
                "sshpass -p '{}' {}",
                escaped, ssh_prefix
            ));
        } else {
            return ProbeDaemonResult { ok: false, daemon_url: None, api_key: None };
        }
    } else {
        return ProbeDaemonResult { ok: false, daemon_url: None, api_key: None };
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
        None => return ProbeDaemonResult { ok: false, daemon_url: None, api_key: None },
    };

    // Read daemon API key from remote
    let read_key_cmd = format!(
        "{} {} \"cat ~/.clawpilot/daemon.key 2>/dev/null\"",
        ssh_prefix_with_pass.as_ref().unwrap_or(&ssh_prefix),
        target
    );

    let api_key = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&read_key_cmd)
        .output()
        .await
        .ok()
        .and_then(|out| {
            let key = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if key.is_empty() { None } else { Some(key) }
        });

    let daemon_url = format!("http://{}:{}", host, found_port);

    // Update office daemon config
    if let Some(ref key) = api_key {
        let _ = update_office_daemon_config(pool, office_id, &daemon_url, key);
    }

    ProbeDaemonResult {
        ok: true,
        daemon_url: Some(daemon_url),
        api_key,
    }
}

/// Result of probing for a daemon
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProbeDaemonResult {
    pub ok: bool,
    pub daemon_url: Option<String>,
    pub api_key: Option<String>,
}

/// Read local daemon API key from ~/.clawpilot/daemon.key
fn read_local_daemon_key() -> Option<String> {
    use std::fs;

    let key_path = dirs::home_dir()
        .map(|home| home.join(".clawpilot").join("daemon.key"))?;

    fs::read_to_string(&key_path)
        .ok()
        .map(|s| s.trim().to_string())
}

/// Update office daemon configuration
pub fn update_office_daemon_config(pool: &DbPool, office_id: &str, daemon_url: &str, api_key: &str) -> Result<()> {
    use crate::utils::crypto::encrypt;

    let conn = pool.get()?;
    let ts = now();

    let encrypted_key = encrypt(api_key)?;

    conn.execute(
        "UPDATE offices SET daemon_url = ?2, daemon_api_key = ?3, updated_at = ?4 WHERE id = ?1",
        rusqlite::params![office_id, daemon_url, encrypted_key, ts],
    )?;

    Ok(())
}

/// Update office daemon configuration by office ID (public wrapper)
pub fn update_office_daemon_config_by_id(pool: &DbPool, office_id: &str, daemon_url: &str, api_key: &str) -> Result<()> {
    update_office_daemon_config(pool, office_id, daemon_url, api_key)
}

/// Get the version of local clawpilot-daemon binary
pub async fn get_local_daemon_version() -> Result<Option<String>> {
    use std::process::Command;

    // Try to find daemon binary
    let daemon_paths = [
        "clawpilot-daemon",
        "~/bin/clawpilot-daemon",
        "/usr/local/bin/clawpilot-daemon",
    ];

    for path in &daemon_paths {
        let expanded = if path.starts_with("~/") {
            if let Some(home) = dirs::home_dir() {
                home.join(&path[2..]).to_string_lossy().to_string()
            } else {
                continue
            }
        } else {
            path.to_string()
        };

        let output = Command::new(&expanded)
            .arg("--version")
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .to_string();
                return Ok(Some(version));
            }
        }
    }

    Ok(None)
}

/// Get the name of the current running OPC
pub fn get_current_opc_name(pool: &DbPool) -> Result<String> {
    let conn = pool.get()?;
    let name: String = conn
        .query_row(
            "SELECT display_name FROM opc_config WHERE is_running = 1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("No running OPC found".to_string())
            }
            other => AppError::Database(other),
        })?;
    Ok(name)
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use crate::models::opc::OpcConfig;
    use crate::services::opc_service;
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_office(name: &str) -> Office {
        Office {
            id: String::new(),
            name: name.to_string(),
            address: Some("127.0.0.1".to_string()),
            access_card: None,
            phone: None,
            receptionist_image: None,
            ownership: "RENTED".to_string(),
            monthly_rent: None,
            internet_speed: None,
            decoration_grade: "MEDIUM".to_string(),
            description: None,
            daemon_url: None,
            daemon_api_key: None,
            opc_root: None,
            created_at: 0,
            updated_at: 0,
            current_opc_id: None,
            current_opc_name: None,
        }
    }

    fn make_opc(name: &str) -> OpcConfig {
        OpcConfig {
            id: String::new(),
            name: name.to_string(),
            display_name: name.to_string(),
            description: None,
            avatar_color: None,
            avatar_initials: None,
            is_active: false,
            is_running: false,
            agent_count: 0,
            channel_count: 0,
            message_count_today: 0,
            message_growth: 0.0,
            created_at: 0,
            updated_at: 0,
            office_id: None,
            office_name: None,
        }
    }

    // --- CRUD 测试 ---
    #[test]
    fn test_create_office() {
        let pool = setup();
        let office = make_office("test-office");

        let result = create_office(&pool, &office);
        assert!(result.is_ok());

        let id = result.unwrap();
        assert!(!id.is_empty());
    }

    #[test]
    fn test_get_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = get_office(&pool, &id);
        assert!(result.is_ok());

        let fetched = result.unwrap();
        assert_eq!(fetched.id, id);
        assert_eq!(fetched.name, "test-office");
    }

    #[test]
    fn test_get_office_not_found() {
        let pool = setup();

        let result = get_office(&pool, "nonexistent-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_offices() {
        let pool = setup();

        create_office(&pool, &make_office("office-1")).unwrap();
        create_office(&pool, &make_office("office-2")).unwrap();

        let result = get_offices(&pool);
        assert!(result.is_ok());

        let offices = result.unwrap();
        assert_eq!(offices.len(), 2);
    }

    #[test]
    fn test_get_offices_empty() {
        let pool = setup();

        let result = get_offices(&pool);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_update_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("original")).unwrap();

        let mut updated = make_office("updated");
        updated.address = Some("192.168.1.1".to_string());

        let result = update_office(&pool, &id, &updated);
        assert!(result.is_ok());

        let fetched = get_office(&pool, &id).unwrap();
        assert_eq!(fetched.name, "updated");
        assert_eq!(fetched.address, Some("192.168.1.1".to_string()));
    }

    #[test]
    fn test_update_office_not_found() {
        let pool = setup();

        let result = update_office(&pool, "nonexistent", &make_office("test"));
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("to-delete")).unwrap();

        let result = delete_office(&pool, &id);
        assert!(result.is_ok());

        let fetch_result = get_office(&pool, &id);
        assert!(fetch_result.is_err());
    }

    // --- Office-OPC 关联测试 ---
    #[test]
    fn test_assign_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = assign_office(&pool, &opc_id, Some(&office_id));
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert_eq!(opc.office_id, Some(office_id));
    }

    #[test]
    fn test_unassign_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        assign_office(&pool, &opc_id, Some(&office_id)).unwrap();

        let result = assign_office(&pool, &opc_id, None);
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert!(opc.office_id.is_none());
    }

    #[test]
    fn test_get_opc_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        // 未分配时返回 None
        let result = get_opc_office(&pool, &opc_id);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());

        // 分配后返回 Office
        assign_office(&pool, &opc_id, Some(&office_id)).unwrap();
        let result = get_opc_office(&pool, &opc_id);
        assert!(result.is_ok());
        let office = result.unwrap();
        assert!(office.is_some());
        assert_eq!(office.unwrap().id, office_id);
    }

    #[test]
    fn test_get_opc_office_opc_not_found() {
        let pool = setup();

        let result = get_opc_office(&pool, "nonexistent-opc");
        assert!(result.is_err());
    }

    // --- DaemonHealthResult 测试 ---
    #[test]
    fn test_daemon_health_result_default() {
        let result = DaemonHealthResult::default();
        assert!(!result.ok);
        assert!(result.error.is_none());
        assert!(result.status.is_none());
        assert!(result.version.is_none());
    }

    #[test]
    fn test_daemon_health_result_serde() {
        let result = DaemonHealthResult {
            ok: true,
            status: Some("ok".to_string()),
            version: Some("0.1.0".to_string()),
            openclaw_status: Some("running".to_string()),
            openclaw_pid: Some(12345),
            active_tasks: Some(2),
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: DaemonHealthResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.status, parsed.status);
        assert_eq!(result.version, parsed.version);
    }

    // --- check_daemon_health 测试 ---
    #[tokio::test]
    async fn test_check_daemon_health_empty_url() {
        let result = check_daemon_health("", "").await;
        assert!(!result.ok);
        assert!(result.error.unwrap().contains("未配置"));
    }

    // --- get_office_deployments 测试 ---
    #[test]
    fn test_get_office_deployments_empty() {
        let pool = setup();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = get_office_deployments(&pool, &office_id, 5);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // --- ProbeDaemonResult 测试 ---
    #[test]
    fn test_probe_daemon_result_serde() {
        let result = ProbeDaemonResult {
            ok: true,
            daemon_url: Some("http://127.0.0.1:16668".to_string()),
            api_key: Some("test-key".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: ProbeDaemonResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.daemon_url, parsed.daemon_url);
        assert_eq!(result.api_key, parsed.api_key);
    }
}
