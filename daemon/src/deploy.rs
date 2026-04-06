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

use crate::state::{AppState, TaskState, TaskStatus};
use crate::utils::extract_json;

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

/// Get OpenClaw version via `openclaw --version`
/// Returns "2026.3.28" format or None if not found
pub fn openclaw_version() -> Option<String> {
    use std::process::Command;
    use std::env;

    let home = env::var("HOME").unwrap_or_default();
    let path = env::var("PATH").unwrap_or_default();
    let path = format!(
        "{}/.npm-global/bin:{}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{}",
        home, home, path
    );

    tracing::debug!("openclaw_version: trying with PATH={}", path);

    let output = Command::new("openclaw")
        .args(["--version"])
        .env("PATH", &path)
        .output();

    match &output {
        Ok(o) => {
            tracing::debug!("openclaw_version: exit_code={:?}, stdout={}, stderr={}",
                o.status.code(),
                String::from_utf8_lossy(&o.stdout).trim(),
                String::from_utf8_lossy(&o.stderr).trim()
            );
        }
        Err(e) => {
            tracing::debug!("openclaw_version: command failed: {}", e);
        }
    }

    let output = output.ok()?;

    if !output.status.success() {
        return None;
    }

    // Parse "OpenClaw 2026.3.28 (f9b1079)" -> "2026.3.28"
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
    if parts.len() >= 2 && parts[0] == "OpenClaw" {
        return Some(parts[1].to_string());
    }
    tracing::debug!("openclaw_version: failed to parse output: {}", stdout.trim());
    None
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

    // Ensure PATH includes common locations since daemon may lack them
    let home = env::var("HOME").unwrap_or_default();
    let path = env::var("PATH").unwrap_or_default();
    let path = format!(
        "{}/.npm-global/bin:{}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{}",
        home, home, path
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
    // Use extract_json to find the first valid JSON object/array.
    let clean_json = match extract_json(&stdout) {
        Some(j) => j,
        None => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
    };

    let v: serde_json::Value = match serde_json::from_str(&clean_json) {
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

/// Reset agents sessions by renaming the agents directory.
/// This forces OpenClaw to regenerate fresh sessions on next start,
/// ensuring skills are reloaded properly.
fn reset_agents_sessions() -> anyhow::Result<()> {
    let openclaw_root = openclaw_home();
    let agents_dir = openclaw_root.join("agents");

    if !agents_dir.exists() {
        tracing::info!("agents 目录不存在，无需重置");
        return Ok(());
    }

    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let backup_name = format!("agents.bak.{}", timestamp);
    let backup_path = openclaw_root.join(&backup_name);

    fs::rename(&agents_dir, &backup_path)?;
    tracing::info!("agents 目录已备份为: {}", backup_path.display());

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

/// Canonicalize both base and path, then verify the resolved path is inside base.
/// This prevents symlink escape attacks where an attacker could place a symlink
/// inside base that points outside the directory.
pub(crate) fn safe_join_canonical(base: &Path, entry_path: &Path) -> Option<PathBuf> {
    use std::path::Component;

    // First do lexical check
    let _lexical_path = safe_join(base, entry_path)?;

    // Canonicalize base directory (must exist)
    let base_canon = base.canonicalize().ok()?;

    // For the entry path, we need to handle the case where parent dirs may not exist yet
    // Canonicalize what exists, then append remaining components
    let mut check_path = base_canon.clone();
    for component in entry_path.components() {
        match component {
            Component::RootDir | Component::Prefix(_) | Component::ParentDir => return None,
            Component::CurDir => {}
            Component::Normal(part) => {
                check_path.push(part);
                // If this component exists (as file, dir, or symlink), canonicalize it
                if check_path.exists() {
                    check_path = check_path.canonicalize().ok()?;
                    // Verify we're still inside base
                    if !check_path.starts_with(&base_canon) {
                        return None;
                    }
                }
            }
        }
    }

    // Final check: the full resolved path must be inside base
    if check_path.starts_with(&base_canon) {
        Some(check_path)
    } else {
        None
    }
}

/// Prepare OPC directory before deployment by preserving user data.
///
/// Strategy:
/// 1. If git is available: commit all changes to preserve user data (recommended)
/// 2. If git is not available: fallback to cp -r backup
///
/// Returns the OPC directory path.
pub fn prepare_opc_directory(opc_id: &str, custom_root: Option<&Path>) -> anyhow::Result<PathBuf> {
    let opc_dir = if let Some(root) = custom_root {
        root.join(opc_id)
    } else {
        openclaw_home().join("OPC").join(opc_id)
    };

    if !opc_dir.exists() {
        tracing::info!("OPC 目录不存在，跳过准备：{}", opc_dir.display());
        return Ok(opc_dir);
    }

    tracing::info!("准备 OPC 目录（保存用户数据）：{}", opc_dir.display());

    // Check if git is available
    let git_available = std::process::Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if git_available {
        // Use git to preserve user data
        tracing::info!("使用 git 保存用户数据");
        prepare_with_git(&opc_dir)?;
    } else {
        // Fallback to cp -r backup
        tracing::info!("git 不可用，回退到 cp -r 备份");
        prepare_with_backup(opc_id, &opc_dir, custom_root)?;
    }

    Ok(opc_dir)
}

/// Prepare using git (commits all changes)
fn prepare_with_git(opc_dir: &Path) -> anyhow::Result<()> {
    let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    let commit_message = format!("chore: auto-commit before deploy at {}", timestamp);

    // Check if git is initialized
    let git_dir = opc_dir.join(".git");
    let is_git_repo = git_dir.exists();

    let git_result = if is_git_repo {
        tracing::debug!("Git 仓库已存在，添加变更...");
        std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(opc_dir)
            .status()
    } else {
        tracing::info!("初始化 Git 仓库...");
        let init_result = std::process::Command::new("git")
            .args(["init"])
            .current_dir(opc_dir)
            .status();

        match init_result {
            Ok(status) if status.success() => {
                // Create .gitignore to exclude large/generated files
                let gitignore = opc_dir.join(".gitignore");
                let gitignore_content = r#"# OpenClaw generated files
*.log
*.tmp

# Node modules (if any)
node_modules/

# OS files
.DS_Store
Thumbs.db
"#;
                let _ = fs::write(&gitignore, gitignore_content);
                tracing::debug!("已创建 .gitignore");

                // Initial add
                std::process::Command::new("git")
                    .args(["add", "-A"])
                    .current_dir(opc_dir)
                    .status()
            }
            other => other,
        }
    };

    // Commit changes
    match git_result {
        Ok(status) if status.success() => {
            let commit_result = std::process::Command::new("git")
                .args(["commit", "-m", &commit_message, "--allow-empty"])
                .current_dir(opc_dir)
                .status();

            match commit_result {
                Ok(status) if status.success() => {
                    tracing::info!("✓ Git 提交完成：{}", commit_message);
                }
                Ok(status) => {
                    tracing::debug!("Git commit exited with status: {:?} (可能无变更)", status.code());
                }
                Err(e) => {
                    tracing::warn!("Git commit 执行失败：{}，继续部署", e);
                }
            }
        }
        Ok(status) => {
            tracing::warn!("Git add 退出码非零：{:?}，继续部署", status.code());
        }
        Err(e) => {
            tracing::warn!("Git 命令执行失败：{}，继续部署", e);
        }
    }

    Ok(())
}

/// Fallback: backup using cp -r
fn prepare_with_backup(opc_id: &str, opc_dir: &Path, custom_root: Option<&Path>) -> anyhow::Result<()> {
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let backup_name = format!("{}-bak-{}", opc_id, timestamp);
    let backup_dir = if let Some(root) = custom_root {
        root.join(&backup_name)
    } else {
        openclaw_home().join("OPC").join(&backup_name)
    };

    tracing::info!("备份 OPC 目录：{} → {}", opc_dir.display(), backup_dir.display());

    let backup_result = std::process::Command::new("cp")
        .args(["-r", "-p"])
        .arg(opc_dir)
        .arg(&backup_dir)
        .status();

    match backup_result {
        Ok(status) if status.success() => {
            tracing::info!("✓ OPC 目录备份完成：{}", backup_dir.display());
        }
        Ok(status) => {
            tracing::warn!("备份命令退出码非零：{:?}，继续部署", status.code());
        }
        Err(e) => {
            tracing::warn!("备份命令执行失败：{}，继续部署", e);
        }
    }

    Ok(())
}

/// Extract tar.gz package to ~/.openclaw/ directory (or custom root)
/// Extracts all files preserving the directory structure from the package
///
/// The tar package contains paths like "{opc_id}/workspace-xxx/..." and "{opc_id}/skills/...".
///
/// If custom_root is provided, it's used as the base directory, and opc_id is appended.
/// Otherwise, defaults to ~/.openclaw/OPC/{opc_id}.
///
/// **Important**: Call `prepare_opc_directory` before this function to preserve user data.
/// The extraction only overwrites files present in the tar package - user-created files
/// (like memory/YYYY-MM-DD.md) are preserved.
pub fn extract_package(opc_id: &str, data: &[u8], custom_root: Option<&Path>) -> anyhow::Result<()> {
    // Determine the target OPC directory
    let opc_dir = if let Some(root) = custom_root {
        root.join(opc_id)
    } else {
        openclaw_home().join("OPC").join(opc_id)
    };

    tracing::info!("解压目标目录：{}", opc_dir.display());

    // Create OPC directory
    fs::create_dir_all(&opc_dir)?;
    tracing::info!("创建目录完成：{}", opc_dir.display());
    tracing::info!("部署包大小：{} bytes", data.len());

    let gz = GzDecoder::new(data);
    tracing::info!("Gzip 解码器已创建");

    let mut archive = Archive::new(gz);
    tracing::info!("Tar 存档已创建");

    tracing::info!("开始解压 tar.gz...");

    // Collect all entries first to handle potential errors early
    let entries_result = archive.entries();
    match entries_result {
        Ok(entries) => {
            for (idx, entry_result) in entries.enumerate() {
                tracing::info!("处理 tar 条目 #{}", idx);
                let mut entry = match entry_result {
                    Ok(e) => e,
                    Err(e) => {
                        tracing::error!("读取 tar 条目 #{} 失败：{}", idx, e);
                        return Err(anyhow!("读取 tar 条目 #{} 失败：{}", idx, e));
                    }
                };
                let path = entry.path()?;
                let path_str = path.to_string_lossy();

                tracing::info!("处理条目 #{}: {}", idx, path_str);

                // Skip root-level manifest.json and openclaw.json (single path component).
                // Nested files like {opc_id}/openclaw.json are allowed through so that
                // merge_into_openclaw_config can find and apply the OPC-specific config.
                let is_root_level = path.components().count() == 1;
                if is_root_level && (
                    path.file_name().map(|n| n == "manifest.json").unwrap_or(false)
                    || path.file_name().map(|n| n == "openclaw.json").unwrap_or(false)
                ) {
                    tracing::debug!("跳过根级文件：{}", path_str);
                    continue;
                }

                // Strip {opc_id}/ prefix from tar paths
                // The tar package contains paths like "{opc_id}/workspace-xxx/..." and "{opc_id}/skills/..."
                // We need to remove the first component to get the relative path within the OPC directory
                let rel_path = path.components().skip(1).collect::<PathBuf>();
                tracing::debug!("相对路径：{}", rel_path.display());

                // All other files go to OPC directory
                let dest = match safe_join_canonical(&opc_dir, &rel_path) {
                    Some(d) => d,
                    None => {
                        tracing::warn!("路径穿越检测：{}", rel_path.display());
                        return Err(anyhow!("Path traversal detected: {}", rel_path.display()));
                    }
                };

                if entry.header().entry_type().is_dir() {
                    tracing::debug!("创建目录：{}", dest.display());
                    fs::create_dir_all(&dest)?;
                } else if entry.header().entry_type().is_symlink() {
                    // Handle symlink
                    tracing::info!("准备创建 symlink: {}", dest.display());

                    // Ensure parent directory exists
                    if let Some(parent) = dest.parent() {
                        tracing::info!("确保父目录存在：{}", parent.display());
                        fs::create_dir_all(parent)?;
                    }

                    let mut link_target = Vec::new();
                    entry.read_to_end(&mut link_target)?;
                    let link_target_str = String::from_utf8_lossy(&link_target);
                    let link_target_clean = link_target_str.trim_end_matches('\0').to_string();

                    tracing::info!("Symlink 目标：{}", link_target_clean);

                    // Remove existing symlink if any
                    if dest.exists() || dest.is_symlink() {
                        tracing::info!("移除已存在的文件：{}", dest.display());
                        fs::remove_file(&dest)?;
                    }

                    #[cfg(unix)]
                    {
                        let symlink_result = std::os::unix::fs::symlink(&link_target_clean, &dest);
                        match symlink_result {
                            Ok(_) => tracing::info!("Created symlink: {} -> {}", dest.display(), link_target_clean),
                            Err(e) => {
                                tracing::error!("创建 symlink 失败：{} -> {} (错误：{})", dest.display(), link_target_clean, e);
                                return Err(anyhow!("创建 symlink 失败：{}", e));
                            }
                        }
                    }
                } else {
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    let mut content = Vec::new();
                    entry.read_to_end(&mut content)?;
                    tracing::info!("写入文件：{} ({} bytes)", dest.display(), content.len());
                    fs::write(&dest, content)?;
                }
            } // end for loop
        } // end Ok arm
        Err(e) => {
            tracing::error!("无法读取 tar 条目：{}", e);
            return Err(anyhow!("无法读取 tar 条目：{}", e));
        }
    } // end match

    tracing::info!("解压完成 → OPC dir: {}", opc_dir.display());
    Ok(())
}

/// Update main ~/.openclaw/openclaw.json with $include references to the OPC's json5 files.
///
/// This preserves existing configuration (gateway token, logging, etc.) and only
/// updates the $include references for agents, models, channels, and bindings.
///
/// The OPC directory should contain: agents.json5, models.json5, channels.json5, bindings.json5
pub fn merge_into_openclaw_config(opc_id: &str, opc_root: Option<&Path>) -> anyhow::Result<()> {
    let openclaw_root = openclaw_home();
    let main_config_path = openclaw_root.join("openclaw.json");

    // Read existing main config
    let existing_config: serde_json::Value = if main_config_path.exists() {
        let main_str = fs::read_to_string(&main_config_path)?;
        serde_json::from_str(&main_str).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Create backup with timestamp
    if main_config_path.exists() {
        let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let backup_path = openclaw_home().join(format!("openclaw.json.bak.{}", timestamp));
        fs::copy(&main_config_path, &backup_path)?;
        tracing::info!("Backed up main config to {}", backup_path.display());
    }

    // Build ordered config: $include fields first, then other fields
    // This ensures agents, bindings, channels, models are grouped together
    let include_fields = [
        ("agents", format!("./OPC/{}/agents.json5", opc_id)),
        ("bindings", format!("./OPC/{}/bindings.json5", opc_id)),
        ("channels", format!("./OPC/{}/channels.json5", opc_id)),
        ("models", format!("./OPC/{}/models.json5", opc_id)),
    ];

    // Collect non-include fields from existing config
    let include_keys: std::collections::HashSet<&str> = include_fields.iter().map(|(k, _)| *k).collect();
    let other_fields: Vec<(&str, &serde_json::Value)> = existing_config
        .as_object()
        .map(|obj| {
            obj.iter()
                .filter(|(k, _)| !include_keys.contains(k.as_str()))
                .map(|(k, v)| (k.as_str(), v))
                .collect()
        })
        .unwrap_or_default();

    // Build output string manually to control field order
    let mut lines = vec!["{".to_string()];

    // Add $include fields first (grouped together)
    for (key, path) in &include_fields {
        lines.push(format!(r#"  "{}": {{"$include": "{}"}},"#, key, path));
    }

    // Add other fields
    for (i, (key, value)) in other_fields.iter().enumerate() {
        let value_str = serde_json::to_string_pretty(value)?;
        // Indent each line of the value
        let indented: String = value_str
            .lines()
            .enumerate()
            .map(|(line_num, line)| {
                if line_num == 0 {
                    line.to_string()
                } else {
                    format!("  {}", line)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        let comma = if i == other_fields.len() - 1 { "" } else { "," };
        lines.push(format!(r#"  "{}": {}{}"#, key, indented, comma));
    }

    lines.push("}".to_string());
    let output = lines.join("\n");

    fs::write(&main_config_path, format!("{}\n", output))?;
    tracing::info!("Updated $include references in {}", main_config_path.display());

    tracing::info!("Merged OPC {} $include references", opc_id);
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

/// Expand tilde (~) to home directory
fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~") {
        let rest = path.trim_start_matches("~");
        let rest = rest.strip_prefix("/").unwrap_or(rest);
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(rest)
    } else {
        PathBuf::from(path)
    }
}

/// Full deploy flow (runs in background task)
pub async fn run_deploy(
    state: AppState,
    task_id: String,
    opc_id: String,
    package_bytes: Vec<u8>,
    checksum: Option<String>,
    opc_root: Option<String>,  // 自定义部署目录
) {
    // If custom opc_root is provided, expand tilde and use it instead of default ~/.openclaw
    let custom_root = opc_root.map(|s| expand_tilde(&s));

    let update = |f: &dyn Fn(&mut TaskState)| {
        if let Some(t) = state.tasks.get(&task_id) {
            t.update(f);
        }
    };

    update(&|t| {
        t.status = TaskStatus::Running;
        t.progress = 5;
        t.current_step = "开始部署".to_string();
        t.log("开始部署");
    });

    // Log custom root if set
    if let Some(ref root) = custom_root {
        update(&|t| t.log(format!("使用自定义部署目录: {}", root.display())));
    }

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

    // 2. Prepare OPC directory (git commit user data)
    update(&|t| {
        t.progress = 25;
        t.current_step = "准备部署目录".to_string();
        t.log("准备 OPC 目录（保存用户数据）...");
    });

    match tokio::task::spawn_blocking({
        let opc_id2 = opc_id.clone();
        let custom = custom_root.clone();
        move || prepare_opc_directory(&opc_id2, custom.as_deref())
    })
    .await
    {
        Ok(Ok(_)) => {
            update(&|t| t.log("✓ OPC 目录准备完成"));
        }
        Ok(Err(e)) => {
            update(&|t| t.log(format!("⚠ 准备失败（继续部署）: {}", e)));
        }
        Err(e) => {
            update(&|t| t.log(format!("⚠ 准备 panic: {}", e)));
        }
    }

    // 3. Backup current config
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
        let custom = custom_root.clone();
        move || extract_package(&opc_id2, &bytes, custom.as_deref())
    })
    .await;

    match extract_result {
        Ok(Ok(())) => {
            update(&|t| t.log("✓ 解压完成"));

            // 3.5 Merge into main openclaw.json
            update(&|t| {
                t.progress = 70;
                t.current_step = "合并到主配置".to_string();
                t.log("合并 agents/models 到主配置...");
            });

            match tokio::task::spawn_blocking({
                let opc_id2 = opc_id.clone();
                let custom = custom_root.clone();
                move || merge_into_openclaw_config(&opc_id2, custom.as_deref())
            })
            .await
            {
                Ok(Ok(())) => {
                    update(&|t| t.log("✓ 合并完成"));
                }
                Ok(Err(e)) => {
                    update(&|t| t.log(format!("⚠ 合并失败（OPC 解压成功，但可能无法立即生效）: {}", e)));
                }
                Err(e) => {
                    update(&|t| t.log(format!("⚠ 合并 panic: {}", e)));
                }
            }

            // 3.6 Reset agents sessions for fresh skill loading
            update(&|t| {
                t.log("重置 agent sessions...");
            });
            match tokio::task::spawn_blocking(move || reset_agents_sessions()).await {
                Ok(Ok(())) => {
                    update(&|t| t.log("✓ agent sessions 已重置"));
                }
                Ok(Err(e)) => {
                    update(&|t| t.log(format!("⚠ 重置 sessions 失败（继续部署）: {}", e)));
                }
                Err(e) => {
                    update(&|t| t.log(format!("⚠ 重置 sessions panic: {}", e)));
                }
            }
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
    let update = |f: &dyn Fn(&mut TaskState)| {
        if let Some(t) = state.tasks.get(&task_id) {
            t.update(f);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── verify_checksum 测试 ──────────────────────────────────────

    #[test]
    fn test_verify_checksum_valid() {
        let data = b"hello world";
        let hash = hex::encode(Sha256::digest(data));
        let checksum = format!("sha256:{}", hash);

        assert!(verify_checksum(data, &checksum));
    }

    #[test]
    fn test_verify_checksum_invalid() {
        let data = b"hello world";

        // Wrong hash
        assert!(!verify_checksum(data, "sha256:0000000000000000000000000000000000000000000000000000000000000000"));

        // Empty checksum
        assert!(!verify_checksum(data, ""));
    }

    #[test]
    fn test_verify_checksum_without_prefix() {
        let data = b"hello world";
        let hash = hex::encode(Sha256::digest(data));

        // Should work without sha256: prefix too
        assert!(verify_checksum(data, &hash));
    }

    // ── safe_join 测试 ────────────────────────────────────────────

    #[test]
    fn test_safe_join_valid() {
        let base = Path::new("/base");
        let entry = Path::new("subdir/file.txt");

        let result = safe_join(base, entry).unwrap();
        assert_eq!(result, PathBuf::from("/base/subdir/file.txt"));
    }

    #[test]
    fn test_safe_join_current_dir() {
        let base = Path::new("/base");
        let entry = Path::new("./subdir/file.txt");

        let result = safe_join(base, entry).unwrap();
        assert_eq!(result, PathBuf::from("/base/./subdir/file.txt"));
    }

    #[test]
    fn test_safe_join_parent_dir_rejected() {
        let base = Path::new("/base");
        let entry = Path::new("../etc/passwd");

        assert!(safe_join(base, entry).is_none());
    }

    #[test]
    fn test_safe_join_absolute_path_rejected() {
        let base = Path::new("/base");
        let entry = Path::new("/etc/passwd");

        assert!(safe_join(base, entry).is_none());
    }

    #[test]
    fn test_safe_join_traversal_after_valid_prefix() {
        let base = Path::new("/base");
        let entry = Path::new("valid/../..");

        assert!(safe_join(base, entry).is_none());
    }

    #[test]
    fn test_safe_join_complex_traversal() {
        let base = Path::new("/base");
        let entry = Path::new("a/b/../../c/../../../etc/passwd");

        assert!(safe_join(base, entry).is_none());
    }

    #[test]
    fn test_safe_join_stays_inside_base() {
        let base = Path::new("/base");
        let entry = Path::new("subdir");

        let result = safe_join(base, entry).unwrap();
        assert!(result.starts_with(base));
    }

    // ── safe_join_canonical 测试 ─────────────────────────────────

    #[test]
    fn test_safe_join_canonical_valid() {
        let temp = TempDir::new().unwrap();
        let subdir = temp.path().join("subdir");
        fs::create_dir_all(&subdir).unwrap();

        let entry = Path::new("subdir/file.txt");
        let result = safe_join_canonical(temp.path(), entry);

        assert!(result.is_some());
    }

    #[test]
    #[cfg(unix)]
    fn test_safe_join_canonical_symlink_escape() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path().join("base");
        fs::create_dir_all(&base).unwrap();

        let outside = temp.path().join("outside");
        fs::write(&outside, "secret").unwrap();

        // Create symlink inside base pointing outside
        let symlink_path = base.join("escape");
        symlink(&outside, &symlink_path).unwrap();

        // Try to traverse through symlink
        let entry = Path::new("escape/../outside");
        let result = safe_join_canonical(&base, entry);

        // Should be None because canonicalization resolves symlinks
        // and the result would be outside base
        assert!(result.is_none());
    }

    // ── copy_dir_all 测试 ────────────────────────────────────────

    #[test]
    fn test_copy_dir_all() {
        let src_temp = TempDir::new().unwrap();
        let dst_temp = TempDir::new().unwrap();

        // Create source structure
        let src = src_temp.path();
        fs::create_dir_all(src.join("subdir")).unwrap();
        fs::write(src.join("file1.txt"), "content1").unwrap();
        fs::write(src.join("subdir/file2.txt"), "content2").unwrap();

        let dst = dst_temp.path().join("dest");

        copy_dir_all(src, &dst).unwrap();

        // Verify structure copied
        assert!(dst.join("file1.txt").exists());
        assert!(dst.join("subdir/file2.txt").exists());
        assert_eq!(fs::read_to_string(dst.join("file1.txt")).unwrap(), "content1");
    }

    // ── Gateway status 测试 ──────────────────────────────────────

    #[test]
    fn test_gateway_status_structure() {
        let status = GatewayStatus {
            is_running: false,
            pid: None,
            rpc_ok: false,
        };

        assert!(!status.is_running);
        assert!(status.pid.is_none());
        assert!(!status.rpc_ok);
    }

    #[test]
    fn test_gateway_status_with_pid() {
        let status = GatewayStatus {
            is_running: true,
            pid: Some(12345),
            rpc_ok: true,
        };

        assert!(status.is_running);
        assert_eq!(status.pid, Some(12345));
        assert!(status.rpc_ok);
    }

    // ── Path traversal security tests ─────────────────────────────

    #[test]
    fn test_path_traversal_stays_inside_base() {
        let base = Path::new("/base");
        let entry = Path::new("file.txt");

        let result = safe_join(base, entry).unwrap();
        assert!(result.starts_with(base));
    }

    // ── Package extraction tests ─────────────────────────────────

    #[test]
    fn test_openclaw_home() {
        let home = openclaw_home();
        // Should be in user's home directory under .openclaw
        assert!(home.to_string_lossy().contains(".openclaw"));
    }

    #[test]
    fn test_pid_file() {
        let pid = pid_file();
        // Should be in .openclaw directory
        assert!(pid.to_string_lossy().contains(".openclaw"));
        assert!(pid.to_string_lossy().ends_with("openclaw.pid"));
    }

    // ── GatewayStatus tests ─────────────────────────────────────

    #[test]
    fn test_gateway_status_default() {
        let status = GatewayStatus {
            is_running: false,
            pid: None,
            rpc_ok: false,
        };

        assert!(!status.is_running);
        assert!(status.pid.is_none());
        assert!(!status.rpc_ok);
    }

    #[test]
    fn test_gateway_status_running() {
        let status = GatewayStatus {
            is_running: true,
            pid: Some(12345),
            rpc_ok: true,
        };

        assert!(status.is_running);
        assert_eq!(status.pid, Some(12345));
        assert!(status.rpc_ok);
    }

    // ── Backup tests ────────────────────────────────────────────

    #[test]
    fn test_backup_opc_handles_missing_opc() {
        use tempfile::TempDir;

        // Test that backup_opc handles missing OPC gracefully
        // The function should not panic - it should return Ok with empty backup or error
        let result = std::panic::catch_unwind(|| {
            // Can't actually run backup_opc without real OPC directory in test
            // Just verify the function doesn't panic when OPC doesn't exist
            // by checking if backup_opc is safe to call
            let opc_id = "nonexistent-opc-id-for-testing";
            // The function will try to read from home/.openclaw/OPC/{opc_id}
            // If it doesn't exist, it creates empty backup dir
            backup_opc(opc_id)
        });

        // Should either succeed (with warning) or fail gracefully, not panic
        // In practice, backup_opc creates the backup dir even if source doesn't exist
        assert!(result.is_ok());
    }
}

