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
