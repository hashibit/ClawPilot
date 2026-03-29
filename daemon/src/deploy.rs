use anyhow::{anyhow, Context};
use chrono::Utc;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tar::Archive;

use crate::state::{AppState, TaskRecord, TaskStatus};

/// ~/.openclaw base directory
fn openclaw_home() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join(".openclaw")
}

/// PID file path
fn pid_file() -> PathBuf {
    openclaw_home().join("openclaw.pid")
}

/// Read OpenClaw PID from file
pub fn read_openclaw_pid() -> Option<u32> {
    let contents = fs::read_to_string(pid_file()).ok()?;
    contents.trim().parse::<u32>().ok()
}

/// Check if OpenClaw process is running (legacy PID-file check)
pub fn is_openclaw_running() -> bool {
    if let Some(pid) = read_openclaw_pid() {
        #[cfg(unix)]
        {
            use nix::sys::signal;
            use nix::unistd::Pid;
            signal::kill(Pid::from_raw(pid as i32), None).is_ok()
        }
        #[cfg(not(unix))]
        {
            false
        }
    } else {
        false
    }
}

/// Result of `openclaw gateway status` probe
pub struct GatewayStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub rpc_ok: bool,
}

/// Query gateway status via `openclaw gateway status --json`.
///
/// Relevant fields from the JSON output:
///   service.runtime.status  = "running" | "stopped"
///   service.runtime.pid     = 34575
///   rpc.ok                  = true
///
/// Falls back to is_running=false when the command fails or JSON is absent.
pub fn openclaw_gateway_status() -> GatewayStatus {
    use std::process::Command;
    use std::env;

    // Ensure PATH includes common Homebrew paths since daemon may lack them
    let path = env::var("PATH").unwrap_or_default();
    let path = format!(
        "/opt/homebrew/bin:/usr/local/bin:{}",
        path
    );

    let output = Command::new("openclaw")
        .args(["gateway", "status", "--json"])
        .env("PATH", path)
        .output();

    let stdout = match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
    };

    // The CLI may print log lines before/after the JSON.
    // Walk backwards from the last '}' counting brace balance to find the matching '{'.
    let bytes = stdout.as_bytes();
    let json_end = match stdout.rfind('}') {
        Some(i) => i,
        None => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
    };
    let json_start = {
        let mut balance: i32 = 0;
        let mut found = None;
        for i in (0..=json_end).rev() {
            match bytes[i] {
                b'}' => balance += 1,
                b'{' => {
                    balance -= 1;
                    if balance == 0 {
                        found = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        match found {
            Some(i) => i,
            None => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
        }
    };
    let v: serde_json::Value = match serde_json::from_str(&stdout[json_start..=json_end]) {
        Ok(v) => v,
        Err(_) => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
    };

    let status = v["service"]["runtime"]["status"].as_str().unwrap_or("");
    let is_running = status == "running";
    let pid = v["service"]["runtime"]["pid"].as_u64().map(|p| p as u32);
    let rpc_ok = v["rpc"]["ok"].as_bool().unwrap_or(false);

    GatewayStatus { is_running, pid, rpc_ok }
}

/// Send SIGHUP to OpenClaw for graceful reload
#[cfg(unix)]
pub fn sighup_openclaw() -> anyhow::Result<()> {
    use nix::sys::signal::{self, Signal};
    use nix::unistd::Pid;

    let pid = read_openclaw_pid()
        .ok_or_else(|| anyhow!("OpenClaw PID 文件不存在或无法读取"))?;

    signal::kill(Pid::from_raw(pid as i32), Signal::SIGHUP)
        .context("发送 SIGHUP 失败")?;

    tracing::info!("已向 OpenClaw (PID={}) 发送 SIGHUP", pid);
    Ok(())
}

#[cfg(not(unix))]
pub fn sighup_openclaw() -> anyhow::Result<()> {
    Err(anyhow!("非 Unix 系统不支持 SIGHUP"))
}

/// Verify sha256 checksum of bytes
pub fn verify_checksum(data: &[u8], expected: &str) -> bool {
    // expected format: "sha256:abcdef..."
    let hash_str = expected.strip_prefix("sha256:").unwrap_or(expected);
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hex::encode(hasher.finalize());
    result == hash_str
}

/// Backup current OPC config to ~/.openclaw/backup/{timestamp}/
pub fn backup_opc(opc_id: &str) -> anyhow::Result<PathBuf> {
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let backup_dir = openclaw_home()
        .join("backup")
        .join(format!("{}-{}", opc_id, timestamp));

    let src = openclaw_home().join("OPC").join(opc_id);
    if src.exists() {
        fs::create_dir_all(&backup_dir)?;
        copy_dir_all(&src, &backup_dir)?;
        tracing::info!("已备份 {} → {}", src.display(), backup_dir.display());
    } else {
        tracing::warn!("OPC 目录不存在，跳过备份: {}", src.display());
        fs::create_dir_all(&backup_dir)?;
    }

    // Prune old backups (keep last 5)
    prune_backups(opc_id, 5)?;

    Ok(backup_dir)
}

fn copy_dir_all(src: &Path, dst: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

fn prune_backups(opc_id: &str, keep: usize) -> anyhow::Result<()> {
    let backup_root = openclaw_home().join("backup");
    if !backup_root.exists() {
        return Ok(());
    }

    let prefix = format!("{}-", opc_id);
    let mut entries: Vec<PathBuf> = fs::read_dir(&backup_root)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with(&prefix)
        })
        .map(|e| e.path())
        .collect();

    entries.sort();
    if entries.len() > keep {
        for old in &entries[..entries.len() - keep] {
            let _ = fs::remove_dir_all(old);
            tracing::info!("清理旧备份: {}", old.display());
        }
    }
    Ok(())
}

/// Resolve a path lexically (without filesystem access) and return None if it
/// would escape `base` via `..` components or absolute components.
pub(crate) fn safe_join(base: &Path, entry_path: &Path) -> Option<PathBuf> {
    use std::path::Component;
    let mut result = base.to_path_buf();
    for component in entry_path.components() {
        match component {
            // Absolute paths or `..` are not allowed
            Component::RootDir | Component::Prefix(_) | Component::ParentDir => return None,
            Component::CurDir => {}
            Component::Normal(part) => result.push(part),
        }
    }
    // Confirm the resolved path is still inside base
    if result.starts_with(base) {
        Some(result)
    } else {
        None
    }
}

/// Extract tar.gz package to OPC directory
pub fn extract_package(opc_id: &str, data: &[u8]) -> anyhow::Result<()> {
    let opc_dir = openclaw_home().join("OPC").join(opc_id);
    fs::create_dir_all(&opc_dir)?;

    let gz = GzDecoder::new(data);
    let mut archive = Archive::new(gz);

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;

        let dest = safe_join(&opc_dir, &path)
            .ok_or_else(|| anyhow!("Path traversal detected in archive: {}", path.display()))?;

        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&dest)?;
        } else {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut content = Vec::new();
            entry.read_to_end(&mut content)?;
            fs::write(&dest, content)?;
        }
    }

    tracing::info!("解压完成 → {}", opc_dir.display());
    Ok(())
}

/// Restore from a backup path
pub fn restore_backup(backup_path: &Path, opc_id: &str) -> anyhow::Result<()> {
    let opc_dir = openclaw_home().join("OPC").join(opc_id);
    if opc_dir.exists() {
        fs::remove_dir_all(&opc_dir)?;
    }
    copy_dir_all(backup_path, &opc_dir)?;
    tracing::info!("已从备份恢复: {}", backup_path.display());
    Ok(())
}

/// Full deploy flow (runs in background task)
pub async fn run_deploy(
    state: AppState,
    task_id: String,
    opc_id: String,
    package_bytes: Vec<u8>,
    checksum: Option<String>,
) {
    let update = |f: &dyn Fn(&mut TaskRecord)| {
        if let Some(mut t) = state.tasks.get_mut(&task_id) {
            f(&mut t);
        }
    };

    update(&|t| {
        t.status = TaskStatus::Running;
        t.progress = 5;
        t.current_step = "开始部署".to_string();
        t.log("开始部署");
    });

    // 1. Verify checksum
    if let Some(ref cs) = checksum {
        if !cs.is_empty() {
            update(&|t| {
                t.progress = 10;
                t.current_step = "验证完整性".to_string();
                t.log("验证部署包完整性...");
            });
            if !verify_checksum(&package_bytes, cs) {
                update(&|t| {
                    t.status = TaskStatus::Failed;
                    t.error = Some("Checksum 验证失败，部署包可能已损坏".to_string());
                    t.log("✗ Checksum 验证失败");
                    t.completed_at = Some(Utc::now());
                });
                return;
            }
            update(&|t| t.log("✓ Checksum 验证通过"));
        }
    }

    // 2. Backup current config
    update(&|t| {
        t.progress = 30;
        t.current_step = "备份配置".to_string();
        t.log("备份当前配置...");
    });

    let backup_path = match tokio::task::spawn_blocking({
        let opc_id2 = opc_id.clone();
        move || backup_opc(&opc_id2)
    })
    .await
    {
        Ok(Ok(p)) => {
            let path_str = p.display().to_string();
            update(&|t| {
                t.backup_path = Some(path_str.clone());
                t.log(format!("✓ 备份完成 → {}", &path_str));
            });
            Some(p)
        }
        Ok(Err(e)) => {
            update(&|t| t.log(format!("⚠ 备份失败（继续部署）: {}", e)));
            None
        }
        Err(e) => {
            update(&|t| t.log(format!("⚠ 备份 panic: {}", e)));
            None
        }
    };

    // 3. Extract package
    update(&|t| {
        t.progress = 60;
        t.current_step = "解压配置文件".to_string();
        t.log("解压配置文件...");
    });

    let extract_result = tokio::task::spawn_blocking({
        let opc_id2 = opc_id.clone();
        let bytes = package_bytes.clone();
        move || extract_package(&opc_id2, &bytes)
    })
    .await;

    match extract_result {
        Ok(Ok(())) => {
            update(&|t| t.log("✓ 解压完成"));
        }
        Ok(Err(e)) => {
            // Attempt rollback
            let err_msg = e.to_string();
            update(&|t| t.log(format!("✗ 解压失败: {}", &err_msg)));
            if let Some(bp) = backup_path {
                let opc_id3 = opc_id.clone();
                let _ = tokio::task::spawn_blocking(move || restore_backup(&bp, &opc_id3)).await;
                update(&|t| t.log("已自动回滚到备份版本"));
            }
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(err_msg.clone());
                t.completed_at = Some(Utc::now());
            });
            return;
        }
        Err(e) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("解压 panic: {}", e));
                t.completed_at = Some(Utc::now());
            });
            return;
        }
    }

    // 4. Send SIGHUP to OpenClaw
    update(&|t| {
        t.progress = 80;
        t.current_step = "重载 OpenClaw".to_string();
        t.log("向 OpenClaw 发送 SIGHUP...");
    });

    match sighup_openclaw() {
        Ok(()) => {
            update(&|t| t.log("✓ SIGHUP 已发送"));
        }
        Err(e) => {
            update(&|t| t.log(format!("⚠ SIGHUP 失败（OpenClaw 可能未运行）: {}", e)));
        }
    }

    // 5. Wait and health check
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    update(&|t| {
        t.progress = 90;
        t.current_step = "健康检查".to_string();
        t.log("检查 OpenClaw 进程状态...");
    });

    let running = is_openclaw_running();
    if running {
        update(&|t| t.log("✓ OpenClaw 运行正常"));
    } else {
        update(&|t| t.log("⚠ OpenClaw 进程未检测到（可能已停止或 PID 文件缺失）"));
    }

    // 6. Done
    update(&|t| {
        t.status = TaskStatus::Success;
        t.progress = 100;
        t.current_step = "部署完成".to_string();
        t.log("✓ 部署成功");
        t.completed_at = Some(Utc::now());
    });

    tracing::info!("deploy task {} completed for opc={}", task_id, opc_id);
}

/// Rollback to a specific backup (or most recent)
pub async fn run_rollback(
    state: AppState,
    task_id: String,
    opc_id: String,
    target_version: Option<String>,
) {
    let update = |f: &dyn Fn(&mut TaskRecord)| {
        if let Some(mut t) = state.tasks.get_mut(&task_id) {
            f(&mut t);
        }
    };

    update(&|t| {
        t.status = TaskStatus::Running;
        t.progress = 10;
        t.current_step = "查找备份".to_string();
        t.log("开始回滚");
    });

    let backup_root = openclaw_home().join("backup");
    let prefix = format!("{}-", opc_id);

    let mut entries: Vec<PathBuf> = match fs::read_dir(&backup_root) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
            .map(|e| e.path())
            .collect(),
        Err(e) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("无法读取备份目录: {}", e));
                t.completed_at = Some(Utc::now());
            });
            return;
        }
    };

    entries.sort();

    let target = if let Some(ver) = target_version {
        entries.iter().find(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().contains(&ver))
                .unwrap_or(false)
        }).cloned()
    } else {
        // Use second-to-last (previous) backup, or last if only one
        if entries.len() >= 2 {
            entries.get(entries.len() - 2).cloned()
        } else {
            entries.last().cloned()
        }
    };

    let backup_path = match target {
        Some(p) => p,
        None => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some("找不到可用的备份版本".to_string());
                t.completed_at = Some(Utc::now());
            });
            return;
        }
    };

    let path_str = backup_path.display().to_string();
    update(&|t| {
        t.progress = 40;
        t.current_step = "恢复备份".to_string();
        t.log(format!("从备份恢复: {}", &path_str));
    });

    let result = tokio::task::spawn_blocking({
        let bp = backup_path.clone();
        let oid = opc_id.clone();
        move || restore_backup(&bp, &oid)
    })
    .await;

    match result {
        Ok(Ok(())) => {
            update(&|t| t.log("✓ 恢复完成"));
        }
        Ok(Err(e)) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(e.to_string());
                t.completed_at = Some(Utc::now());
            });
            return;
        }
        Err(e) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("恢复 panic: {}", e));
                t.completed_at = Some(Utc::now());
            });
            return;
        }
    }

    // SIGHUP
    update(&|t| {
        t.progress = 80;
        t.current_step = "重载 OpenClaw".to_string();
        t.log("发送 SIGHUP...");
    });
    let _ = sighup_openclaw();

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    update(&|t| {
        t.status = TaskStatus::Rolledback;
        t.progress = 100;
        t.current_step = "回滚完成".to_string();
        t.log("✓ 回滚成功");
        t.completed_at = Some(Utc::now());
        t.backup_path = Some(path_str.clone());
    });

    tracing::info!("rollback task {} completed for opc={}", task_id, opc_id);
}

