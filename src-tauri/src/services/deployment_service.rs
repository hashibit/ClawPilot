use chrono::Utc;
use uuid::Uuid;
use std::io::Write;
use zip::{ZipWriter, write::FileOptions};
use std::fs;
use std::path::Path;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::OfficeDeployment;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DeploymentStatus {
    Pending,
    Running,
    Success,
    Failed,
    Rollback,
}

impl DeploymentStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Running => "RUNNING",
            Self::Success => "SUCCESS",
            Self::Failed => "FAILED",
            Self::Rollback => "ROLLBACK",
        }
    }
    fn from_str(s: &str) -> Self {
        match s {
            "RUNNING" => Self::Running,
            "SUCCESS" => Self::Success,
            "FAILED" => Self::Failed,
            "ROLLBACK" => Self::Rollback,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentTask {
    pub id: String,
    pub opc_id: Option<String>,
    pub opc_name: String,
    pub office_id: Option<String>,
    pub office_name: Option<String>,
    pub status: DeploymentStatus,
    pub message: Option<String>,
    /// JSON array of step descriptions
    pub steps: String,
    pub current_step: i64,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeploymentTask> {
    Ok(DeploymentTask {
        id: row.get(0)?,
        opc_name: row.get(1)?,
        status: DeploymentStatus::from_str(&row.get::<_, String>(2)?),
        message: row.get(3)?,
        steps: row.get(4)?,
        current_step: row.get(5)?,
        created_at: row.get(6)?,
        started_at: row.get(7)?,
        completed_at: row.get(8)?,
        opc_id: row.get(9).ok().flatten(),
        office_id: row.get(10).ok().flatten(),
        office_name: row.get(11).ok().flatten(),
    })
}

fn now() -> i64 {
    Utc::now().timestamp()
}

pub fn start_deployment(
    pool: &DbPool,
    opc_id: &str,
    office_id: &str,
) -> Result<String> {
    let conn = pool.get()?;

    // Look up names
    let opc_name: String = conn
        .query_row(
            "SELECT name FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("OPC not found: {opc_id}")))?;

    let office_name: String = conn
        .query_row(
            "SELECT name FROM offices WHERE id = ?1",
            rusqlite::params![office_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("Office not found: {office_id}")))?;

    let id = Uuid::new_v4().to_string();
    let ts = now();
    let steps = r#"["准备配置文件","发送部署包","等待完成","健康检查"]"#;

    conn.execute(
        "INSERT INTO deployment_tasks
             (id, opc_id, office_id, opc_name, status, steps, current_step, created_at, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)",
        rusqlite::params![
            id,
            opc_id,
            office_id,
            opc_name,
            DeploymentStatus::Pending.as_str(),
            steps,
            ts
        ],
    )?;

    // Simulate stub deployment (no daemon configured)
    // In production Tauri we'll call the real daemon
    let pool2 = pool.clone();
    let task_id = id.clone();
    let opc_id2 = opc_id.to_string();
    let opc_name2 = opc_name.clone();
    let office_id2 = office_id.to_string();
    let office_name2 = office_name.clone();

    std::thread::spawn(move || {
        run_stub_deploy(&pool2, &task_id, &opc_id2, &opc_name2, &office_id2, &office_name2);
    });

    Ok(id)
}

fn set_step(pool: &DbPool, id: &str, step: i64, status: &str, extra_msg: Option<&str>) {
    if let Ok(conn) = pool.get() {
        let ts = now();
        let _ = conn.execute(
            "UPDATE deployment_tasks SET status=?2, current_step=?3, message=?4, updated_at=?5 WHERE id=?1",
            rusqlite::params![id, status, step, extra_msg, ts],
        );
    }
}

fn run_stub_deploy(
    pool: &DbPool,
    task_id: &str,
    opc_id: &str,
    opc_name: &str,
    office_id: &str,
    office_name: &str,
) {
    std::thread::sleep(std::time::Duration::from_millis(300));
    set_step(pool, task_id, 1, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(500));
    set_step(pool, task_id, 2, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(400));
    set_step(pool, task_id, 3, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(800));

    let ts = now();
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "UPDATE deployment_tasks SET status='SUCCESS', current_step=4,
             message='(仿真模式：未配置 Daemon)', completed_at=?2, updated_at=?2 WHERE id=?1",
            rusqlite::params![task_id, ts],
        );
        // Record active deployment
        let _ = conn.execute(
            "UPDATE office_deployments SET is_active=0, undeployed_at=?1 WHERE opc_id=?2 AND is_active=1",
            rusqlite::params![ts, opc_id],
        );
        let dep_id = Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active)
             VALUES (?1,?2,?3,?4,?5,?6,1)",
            rusqlite::params![dep_id, opc_id, opc_name, office_id, office_name, ts],
        );
        let _ = conn.execute(
            "UPDATE opc_config SET is_running=1, office_id=?2 WHERE id=?1",
            rusqlite::params![opc_id, office_id],
        );
    }
}

pub fn get_deployment(pool: &DbPool, id: &str) -> Result<DeploymentTask> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT dt.id, dt.opc_name, dt.status, dt.message, dt.steps, dt.current_step,
                dt.created_at, dt.started_at, dt.completed_at,
                dt.opc_id, dt.office_id, o.name
         FROM deployment_tasks dt
         LEFT JOIN offices o ON o.id = dt.office_id
         WHERE dt.id = ?1",
        rusqlite::params![id],
        row_to_task,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn cancel_deployment(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let ts = now();
    conn.execute(
        "UPDATE deployment_tasks SET status='FAILED', message='已取消', completed_at=?2 WHERE id=?1",
        rusqlite::params![id, ts],
    )?;
    Ok(())
}

pub fn undeploy(pool: &DbPool, opc_id: &str) -> Result<()> {
    let conn = pool.get()?;
    let ts = now();
    conn.execute(
        "UPDATE office_deployments SET is_active=0, undeployed_at=?1 WHERE opc_id=?2 AND is_active=1",
        rusqlite::params![ts, opc_id],
    )?;
    conn.execute(
        "UPDATE opc_config SET is_running=0, office_id=NULL WHERE id=?1",
        rusqlite::params![opc_id],
    )?;
    Ok(())
}

pub fn get_recent_deployments(
    pool: &DbPool,
    opc_id: &str,
    limit: i64,
) -> Result<Vec<DeploymentTask>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT dt.id, dt.opc_name, dt.status, dt.message, dt.steps, dt.current_step,
                dt.created_at, dt.started_at, dt.completed_at,
                dt.opc_id, dt.office_id, o.name
         FROM deployment_tasks dt
         LEFT JOIN offices o ON o.id = dt.office_id
         WHERE dt.opc_id = ?1
         ORDER BY dt.created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![opc_id, limit], row_to_task)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_office_deployments(
    pool: &DbPool,
    office_id: &str,
    limit: i64,
) -> Result<Vec<OfficeDeployment>> {
    crate::services::office_service::get_office_deployments(pool, office_id, limit)
}

/// Build a deployment package for an OPC
/// Returns: { ok: true, checksum: String, size: u64, path: String }
pub fn build_deploy_package(pool: &DbPool, opc_id: &str) -> Result<serde_json::Value> {
    let conn = pool.get()?;

    // Get OPC config
    let opc: (String, String) = conn
        .query_row(
            "SELECT name, config_path FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("OPC not found: {}", opc_id))
            }
            other => AppError::Database(other),
        })?;

    let (opc_name, config_path) = opc;

    // Create temp directory for packaging
    let temp_dir = std::env::temp_dir().join(format!("clawpilot_deploy_{}", opc_id));
    fs::create_dir_all(&temp_dir)
        .map_err(|e| AppError::Validation(format!("创建临时目录失败：{}", e)))?;

    // Copy config file to temp dir
    let config_src = Path::new(&config_path);
    let config_dst = temp_dir.join("openclaw.json");

    if config_src.exists() {
        fs::copy(config_src, &config_dst)
            .map_err(|e| AppError::Validation(format!("复制配置文件失败：{}", e)))?;
    } else {
        // Generate config from database
        let config_content = generate_opc_config(pool, opc_id)?;
        fs::write(&config_dst, config_content)
            .map_err(|e| AppError::Validation(format!("写入配置文件失败：{}", e)))?;
    }

    // Create ZIP file
    let zip_path = temp_dir.join(format!("{}.zip", opc_name.replace(' ', "_")));
    let zip_file = fs::File::create(&zip_path)
        .map_err(|e| AppError::Validation(format!("创建 ZIP 文件失败：{}", e)))?;

    let mut zip = ZipWriter::new(zip_file);
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add openclaw.json
    zip.start_file("openclaw.json", options)
        .map_err(|e| AppError::Validation(format!("ZIP 写入失败：{}", e)))?;

    let config_content = fs::read(&config_dst)
        .map_err(|e| AppError::Validation(format!("读取配置文件失败：{}", e)))?;

    zip.write_all(&config_content)
        .map_err(|e| AppError::Validation(format!("ZIP 写入失败：{}", e)))?;

    // TODO: Add agents, tools, skills directories if they exist

    zip.finish()
        .map_err(|e| AppError::Validation(format!("ZIP 完成失败：{}", e)))?;

    // Calculate checksum and size
    let zip_size = fs::metadata(&zip_path)
        .map_err(|e| AppError::Validation(format!("获取文件大小失败：{}", e)))?
        .len();

    let zip_content = fs::read(&zip_path)
        .map_err(|e| AppError::Validation(format!("读取 ZIP 文件失败：{}", e)))?;

    let checksum = format!("{:x}", md5::compute(&zip_content));

    // Cleanup temp config file, keep zip for deployment
    fs::remove_file(&config_dst).ok();

    Ok(serde_json::json!({
        "ok": true,
        "checksum": checksum,
        "size": zip_size,
        "path": zip_path.to_string_lossy().to_string()
    }))
}

/// Generate OPC config JSON from database
fn generate_opc_config(pool: &DbPool, opc_id: &str) -> Result<String> {
    // This is a simplified version - in production you'd want to include
    // full config with agents, tools, skills, bindings, etc.
    let conn = pool.get()?;

    let name: String = conn
        .query_row("SELECT name FROM opc_config WHERE id = ?1", rusqlite::params![opc_id], |r| r.get(0))
        .map_err(|_| AppError::NotFound(format!("OPC not found: {}", opc_id)))?;

    let config = serde_json::json!({
        "name": name,
        "version": "1.0.0",
        "agents": [],
        "tools": [],
        "skills": [],
        "bindings": []
    });

    serde_json::to_string_pretty(&config)
        .map_err(|e| AppError::Serialization(e).into())
}

/// Deploy package to office
pub async fn deploy_to_office(
    pool: &DbPool,
    opc_id: &str,
    office_id: &str,
) -> Result<serde_json::Value> {
    // Start a deployment task (reuse existing start_deployment logic)
    let task_id = start_deployment(pool, opc_id, office_id)?;

    Ok(serde_json::json!({
        "ok": true,
        "task_id": task_id
    }))
}

/// Generate openclaw.json config from OPC data — matches server format with $include references
pub fn generate_openclaw_config(pool: &DbPool, opc_id: &str) -> Result<serde_json::Value> {
    use crate::utils::crypto::decrypt;

    let conn = pool.get()?;

    // Get OPC + associated office (for opc_root)
    let (opc_name, opc_display_name, office_id): (String, String, Option<String>) = conn
        .query_row(
            "SELECT name, display_name, office_id FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("OPC not found: {}", opc_id)),
            other => AppError::Database(other),
        })?;

    // Resolve opc_root from office settings, fall back to default
    let opc_root: String = office_id
        .as_deref()
        .and_then(|oid| {
            conn.query_row(
                "SELECT opc_root FROM offices WHERE id = ?1",
                rusqlite::params![oid],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten()
        })
        .unwrap_or_else(|| format!("~/.openclaw/CPOPC/{}", opc_display_name));

    // Get agents (model field takes priority over model_provider+model_name)
    let agents: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>)> = conn
        .prepare(
            "SELECT name, display_name, model_provider, model_name, initials, model FROM agents WHERE opc_id = ?1 ORDER BY order_index",
        )?
        .query_map(rusqlite::params![opc_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get channels (FEISHU, etc.)
    let channels: Vec<(String, Option<String>)> = conn
        .prepare("SELECT channel_type, feishu_config FROM channels WHERE opc_id = ?1")?
        .query_map(rusqlite::params![opc_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    // Get enabled model providers from model_providers_v2
    let providers: Vec<(String, Option<String>, Option<String>, String, i64)> = conn
        .prepare(
            "SELECT name, api, base_url, COALESCE(api_key, ''), is_enabled FROM model_providers_v2 WHERE is_enabled = 1",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?
        .filter_map(|r| r.ok())
        .collect();

    // Default model from first enabled provider — use provider name + /default (matches server)
    let default_model = providers
        .first()
        .map(|(name, _, _, _, _)| format!("{}/default", name))
        .unwrap_or_else(|| "anthropic/default".to_string());

    // Build agents members list
    let agents_list: Vec<serde_json::Value> = agents
        .iter()
        .map(|(name, display_name, model_provider, model_name, initials, model)| {
            // model field takes priority (matches server: agent.model ?? `provider/model_name`)
            let model_str = model.clone().unwrap_or_else(|| {
                match (model_provider, model_name) {
                    (Some(provider), Some(m)) => format!("{}/{}", provider, m),
                    (Some(provider), None) => format!("{}/default", provider),
                    (None, Some(m)) => m.clone(),
                    (None, None) => default_model.clone(),
                }
            });
            let emoji = initials.as_deref().and_then(|s| s.chars().next()).unwrap_or('🤖');
            serde_json::json!({
                "id": name,
                "name": name,
                "workspace": format!("{}/workspace-{}", opc_root, display_name),
                "model": { "primary": model_str },
                "identity": {
                    "name": display_name,
                    "emoji": emoji.to_string(),
                },
            })
        })
        .collect();

    // Build channels/plugins section
    let mut channels_section = serde_json::Map::new();
    for (channel_type, feishu_config_enc) in &channels {
        if channel_type == "FEISHU" {
            if let Some(enc_data) = feishu_config_enc {
                if let Ok(decrypted) = decrypt(enc_data) {
                    if let Ok(feishu_config) = serde_json::from_str::<serde_json::Value>(&decrypted) {
                        if let Some(app_id) = feishu_config.get("app_id").and_then(|v| v.as_str()) {
                            let app_secret = feishu_config.get("app_secret").and_then(|v| v.as_str()).unwrap_or("");
                            channels_section.insert("feishu".to_string(), serde_json::json!({
                                "enabled": true,
                                "appId": app_id,
                                "appSecret": app_secret,
                                "connectionMode": "websocket",
                                "domain": "feishu",
                                "groupPolicy": "open",
                                "tools": { "perm": true },
                            }));
                        }
                    }
                }
            }
        }
    }

    // Build models section — use actual apiKey string + full models array
    let mut providers_section = serde_json::Map::new();
    for (name, api, base_url, api_key_enc, _) in &providers {
        let api_key = decrypt(api_key_enc).unwrap_or_default();
        let url = base_url.as_deref().unwrap_or("");
        let api_type = api.as_deref().unwrap_or(name.as_str());

        // Get models for this provider
        let models: Vec<serde_json::Value> = conn
            .prepare(
                "SELECT model_id, COALESCE(input_types, '[\"text\"]'), COALESCE(context_window, 0), COALESCE(max_tokens, 0) FROM model_info_v2 WHERE provider_name = ?1 ORDER BY sort_order, model_id",
            )
            .and_then(|mut stmt| {
                stmt.query_map(rusqlite::params![name], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?))
                })
                .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
            })
            .unwrap_or_default()
            .into_iter()
            .map(|(model_id, input_types_raw, ctx_window, max_tokens)| {
                let input: serde_json::Value = serde_json::from_str(&input_types_raw)
                    .unwrap_or_else(|_| serde_json::json!(["text"]));
                serde_json::json!({
                    "id": model_id,
                    "name": model_id,
                    "reasoning": false,
                    "input": input,
                    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                    "contextWindow": ctx_window,
                    "maxTokens": max_tokens,
                })
            })
            .collect();

        let mut provider_obj = serde_json::json!({
            "api": api_type,
            "baseUrl": url,
            "apiKey": api_key,
        });
        if !models.is_empty() {
            provider_obj["models"] = serde_json::json!(models);
        }
        providers_section.insert(name.clone(), provider_obj);
    }

    let plugin_allow: Vec<&str> = if channels_section.contains_key("feishu") { vec!["feishu"] } else { vec![] };

    Ok(serde_json::json!({
        "agents": {
            "defaults": {
                "workspace": opc_root,
                "model": { "primary": default_model },
            },
            "list": agents_list,
        },
        "models": { "$include": format!("./OPC/{}/models.json5", opc_name) },
        "channels": { "$include": format!("./OPC/{}/channels.json5", opc_name) },
        "bindings": { "$include": format!("./OPC/{}/bindings.json5", opc_name) },
        "tools": { "profile": "coding" },
        "messages": { "ackReactionScope": "group-mentions" },
        "commands": {
            "native": "auto",
            "nativeSkills": "auto",
            "restart": true,
            "ownerDisplay": "raw",
        },
        "session": { "dmScope": "per-channel-peer" },
        "gateway": {
            "port": 18789,
            "mode": "local",
            "bind": "loopback",
            "auth": { "mode": "token", "token": "" },
            "tailscale": { "mode": "off", "resetOnExit": false },
            "nodes": {
                "denyCommands": [
                    "camera.snap", "camera.clip", "screen.record",
                    "contacts.add", "calendar.add", "reminders.add", "sms.send"
                ],
            },
        },
        "logging": { "level": "debug" },
        "plugins": {
            "allow": plugin_allow,
            "entries": channels_section,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use crate::models::opc::OpcConfig;
    use crate::models::office::Office;
    use crate::services::{opc_service, office_service};
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
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
            access_auth_type: None,
            access_user: None,
            access_password: None,
            ssh_key_path: None,
            daemon_url: None,
            daemon_api_key: None,
            opc_root: None,
            created_at: 0,
            updated_at: 0,
            current_opc_id: None,
            current_opc_name: None,
        }
    }

    // --- DeploymentStatus 测试 ---
    #[test]
    fn test_deployment_status_as_str() {
        assert_eq!(DeploymentStatus::Pending.as_str(), "PENDING");
        assert_eq!(DeploymentStatus::Running.as_str(), "RUNNING");
        assert_eq!(DeploymentStatus::Success.as_str(), "SUCCESS");
        assert_eq!(DeploymentStatus::Failed.as_str(), "FAILED");
        assert_eq!(DeploymentStatus::Rollback.as_str(), "ROLLBACK");
    }

    #[test]
    fn test_deployment_status_from_str() {
        assert!(matches!(DeploymentStatus::from_str("PENDING"), DeploymentStatus::Pending));
        assert!(matches!(DeploymentStatus::from_str("RUNNING"), DeploymentStatus::Running));
        assert!(matches!(DeploymentStatus::from_str("SUCCESS"), DeploymentStatus::Success));
        assert!(matches!(DeploymentStatus::from_str("FAILED"), DeploymentStatus::Failed));
        assert!(matches!(DeploymentStatus::from_str("ROLLBACK"), DeploymentStatus::Rollback));
        assert!(matches!(DeploymentStatus::from_str("UNKNOWN"), DeploymentStatus::Pending));
    }

    #[test]
    fn test_deployment_status_serde_roundtrip() {
        let statuses = vec![
            DeploymentStatus::Pending,
            DeploymentStatus::Running,
            DeploymentStatus::Success,
            DeploymentStatus::Failed,
            DeploymentStatus::Rollback,
        ];

        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let parsed: DeploymentStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(status, parsed);
        }
    }

    // --- start_deployment 测试 ---
    #[test]
    fn test_start_deployment_creates_task() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();

        let result = start_deployment(&pool, &opc_id, &office_id);
        assert!(result.is_ok());

        let task_id = result.unwrap();
        assert!(!task_id.is_empty());
    }

    #[test]
    fn test_start_deployment_fails_for_nonexistent_opc() {
        let pool = setup();

        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();

        let result = start_deployment(&pool, "nonexistent-opc", &office_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_start_deployment_fails_for_nonexistent_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = start_deployment(&pool, &opc_id, "nonexistent-office");
        assert!(result.is_err());
    }

    // --- get_deployment 测试 ---
    #[test]
    fn test_get_deployment() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();
        let task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();

        std::thread::sleep(std::time::Duration::from_millis(100));

        let result = get_deployment(&pool, &task_id);
        assert!(result.is_ok());

        let task = result.unwrap();
        assert_eq!(task.id, task_id);
        assert_eq!(task.opc_name, "test-opc");
    }

    #[test]
    fn test_get_deployment_not_found() {
        let pool = setup();

        let result = get_deployment(&pool, "nonexistent-task");
        assert!(result.is_err());
    }

    // --- cancel_deployment 测试 ---
    #[test]
    fn test_cancel_deployment() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();
        let task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();

        let result = cancel_deployment(&pool, &task_id);
        assert!(result.is_ok());

        let task = get_deployment(&pool, &task_id).unwrap();
        assert!(matches!(task.status, DeploymentStatus::Failed));
        assert_eq!(task.message, Some("已取消".to_string()));
    }

    // --- undeploy 测试 ---
    #[test]
    fn test_undeploy() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();

        let _task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2500));

        let result = undeploy(&pool, &opc_id);
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert!(!opc.is_running);
    }

    // --- get_recent_deployments 测试 ---
    #[test]
    fn test_get_recent_deployments_empty() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = get_recent_deployments(&pool, &opc_id, 5);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_get_recent_deployments_returns_tasks() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office_service::create_office(&pool, &make_office("test-office")).unwrap();

        start_deployment(&pool, &opc_id, &office_id).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));

        let result = get_recent_deployments(&pool, &opc_id, 5);
        assert!(result.is_ok());

        let deployments = result.unwrap();
        assert!(!deployments.is_empty());
    }

    // --- generate_openclaw_config 测试 ---
    #[test]
    fn test_generate_openclaw_config_fails_for_nonexistent_opc() {
        let pool = setup();

        let result = generate_openclaw_config(&pool, "nonexistent-opc");
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_openclaw_config_returns_json() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = generate_openclaw_config(&pool, &opc_id);
        if let Err(ref e) = result {
            eprintln!("ERROR: {:?}", e);
        }
        assert!(result.is_ok(), "generate_openclaw_config should succeed");

        let config = result.unwrap();
        assert!(config.is_object());
        assert!(config.get("agents").is_some());
    }

    // --- DeploymentTask 结构测试 ---
    #[test]
    fn test_deployment_task_serde() {
        let task = DeploymentTask {
            id: "task-123".to_string(),
            opc_id: Some("opc-456".to_string()),
            opc_name: "Test OPC".to_string(),
            office_id: Some("office-789".to_string()),
            office_name: Some("Test Office".to_string()),
            status: DeploymentStatus::Running,
            message: Some("Deploying...".to_string()),
            steps: r#"["Step 1","Step 2"]"#.to_string(),
            current_step: 1,
            created_at: 1000,
            started_at: Some(1001),
            completed_at: None,
        };

        let json = serde_json::to_string(&task).unwrap();
        let parsed: DeploymentTask = serde_json::from_str(&json).unwrap();

        assert_eq!(task.id, parsed.id);
        assert_eq!(task.opc_name, parsed.opc_name);
        assert_eq!(task.current_step, parsed.current_step);
    }
}
