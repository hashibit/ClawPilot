use std::fs;
use std::io::Write;
use std::path::Path;
use zip::{write::FileOptions, ZipWriter};

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

use super::crud::start_deployment;
use super::config::generate_opc_config;

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
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

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

pub async fn undeploy(pool: &DbPool, opc_id: &str) -> Result<()> {
    use super::types::now;

    // Step 1: Query office info before updating DB
    let office_info: Option<(String, String)> = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT o.daemon_url, o.initial_openclaw_config
             FROM offices o
             JOIN office_deployments od ON od.office_id = o.id
             WHERE od.opc_id = ?1 AND od.is_active = 1
             LIMIT 1",
            rusqlite::params![opc_id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            },
        )
        .ok()
        .filter(|(url, _)| !url.is_empty())
    };

    // Step 2: Update DB
    {
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
    }

    // Step 3: Push reset config to daemon if available (async, best-effort)
    if let Some((daemon_url, initial_config)) = office_info {
        let config_content = if initial_config.is_empty() {
            r#"{"agents":{"defaults":{},"list":[]},"channels":{},"models":{"providers":{}}}"#
                .to_string()
        } else {
            initial_config
        };

        // Build tar.gz in memory containing manifest.json and openclaw.json
        let tar_gz_bytes = build_reset_tar_gz(opc_id, &config_content);
        if let Ok(bytes) = tar_gz_bytes {
            let url = format!("{}/deploy", daemon_url.trim_end_matches('/'));
            let client = reqwest::Client::new();
            let _ = client
                .post(&url)
                .header("Content-Type", "application/octet-stream")
                .body(bytes)
                .send()
                .await;
            // Errors are intentionally ignored — undeploy DB update already succeeded
        }
    }

    Ok(())
}

fn build_reset_tar_gz(opc_id: &str, initial_config: &str) -> std::result::Result<Vec<u8>, anyhow::Error> {
    use flate2::{write::GzEncoder, Compression};
    use tar::Builder;

    let manifest = serde_json::json!({
        "opc_id": null,
        "version": "0.0.0",
        "checksum": "",
        "reset": true,
    });
    let manifest_bytes = serde_json::to_vec(&manifest)?;
    let config_bytes = initial_config.as_bytes();

    let buf = Vec::new();
    let gz = GzEncoder::new(buf, Compression::default());
    let mut tar = Builder::new(gz);

    let mut header = tar::Header::new_gnu();
    header.set_size(manifest_bytes.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    tar.append_data(&mut header, "manifest.json", manifest_bytes.as_slice())?;

    let mut header2 = tar::Header::new_gnu();
    header2.set_size(config_bytes.len() as u64);
    header2.set_mode(0o644);
    header2.set_cksum();
    tar.append_data(&mut header2, "openclaw.json", config_bytes)?;

    let gz_writer = tar.into_inner()?;
    Ok(gz_writer.finish()?)
}
