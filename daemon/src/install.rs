//! OpenClaw installation logic (runs inside daemon on target machine)

use std::process::Command;
use std::io::Write;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use tar::Archive;

use crate::state::{AppState, TaskState, TaskStatus};

/// Request to install OpenClaw
#[derive(Debug, serde::Deserialize)]
pub struct InstallRequest {
    pub version: String,
    pub platform: String,
    pub arch: String,
    pub download_url: String,
    pub sha256_url: String,
}

/// Extended PATH for openclaw CLI locations
fn extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let current = std::env::var("PATH").unwrap_or_default();
    format!(
        "{}/.npm-global/bin:{}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{}",
        home, home, current
    )
}

/// Get install dir for a version
fn install_dir(version: &str) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join(format!("openclaw-v{}", version))
}

/// Get symlink path
fn symlink_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join(".openclaw").join("current")
}

/// Check if openclaw is already installed with the requested version
fn check_openclaw_installed(version: &str) -> Option<String> {
    let output = Command::new("openclaw")
        .args(["--version"])
        .env("PATH", extended_path())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if ver.contains(version) {
        Some(ver)
    } else {
        None
    }
}

/// Download a file using reqwest, streaming to disk
async fn download_file(url: &str, dest: &Path, progress_cb: impl Fn(u64, u64)) -> anyhow::Result<()> {
    use futures_util::StreamExt;

    let response = reqwest::get(url).await
        .map_err(|e| anyhow::anyhow!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!("下载失败: HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut file = File::create(dest)?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| anyhow::anyhow!("下载中断: {}", e))?;
        file.write_all(&bytes)?;
        downloaded += bytes.len() as u64;
        progress_cb(downloaded, total_size);
    }

    Ok(())
}

/// Verify SHA256 of a file against expected hash string
fn verify_file_sha256(sha256_path: &Path) -> anyhow::Result<()> {
    let sha256_content = fs::read_to_string(sha256_path)
        .map_err(|e| anyhow::anyhow!("读取 SHA256 文件失败: {}", e))?;

    // Parse the hash from the .sha256 file (format: "hash  filename" or just "hash")
    let expected_hash = sha256_content
        .split_whitespace()
        .next()
        .ok_or_else(|| anyhow::anyhow!("SHA256 文件为空"))?
        .trim();

    // Get target file path by stripping .sha256 suffix
    let stem = sha256_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let target_name = stem.strip_suffix(".sha256").unwrap_or(&stem);
    let target_path = sha256_path.parent().unwrap_or(Path::new(".")).join(target_name);

    let mut hasher = Sha256::new();
    let mut file = File::open(&target_path)
        .map_err(|e| anyhow::anyhow!("打开文件失败: {}", e))?;
    std::io::copy(&mut file, &mut hasher)
        .map_err(|e| anyhow::anyhow!("计算 SHA256 失败: {}", e))?;
    let actual_hash = hex::encode(hasher.finalize());

    if actual_hash != expected_hash {
        return Err(anyhow::anyhow!(
            "SHA256 校验失败\n期望: {}\n实际: {}", expected_hash, actual_hash
        ));
    }

    Ok(())
}

/// Extract tar.gz to target directory
fn extract_tarball(tar_path: &Path, dest: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(dest)?;
    let file = File::open(tar_path)?;
    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);
    archive.unpack(dest)?;
    Ok(())
}

/// Create symlink: ~/.openclaw/current -> install_dir
fn create_symlink(install_dir: &Path) -> anyhow::Result<()> {
    let link = symlink_path();
    if let Some(parent) = link.parent() {
        fs::create_dir_all(parent)?;
    }

    // Remove existing symlink
    if link.exists() || link.is_symlink() {
        fs::remove_file(&link).ok();
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(install_dir, &link)?;
    }
    #[cfg(not(unix))]
    {
        std::os::windows::fs::symlink_dir(install_dir, &link)?;
    }

    Ok(())
}

/// Run openclaw onboard
fn run_onboard(install_dir: &Path) -> anyhow::Result<()> {
    let node_bin = install_dir.join("nodejs").join("bin").join("node");
    let openclaw_bin = install_dir.join("node_modules").join(".bin").join("openclaw");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if node_bin.exists() {
            let meta = fs::metadata(&node_bin)?;
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o111);
            fs::set_permissions(&node_bin, perms).ok();
        }
    }

    let output = Command::new(&node_bin)
        .arg(&openclaw_bin)
        .args([
            "onboard",
            "--non-interactive",
            "--install-daemon",
            "--skip-skills",
            "--skip-health",
            "--accept-risk",
        ])
        .env("PATH", extended_path())
        .output()
        .map_err(|e| anyhow::anyhow!("onboard 执行失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("onboard 失败: {}", stderr.trim()));
    }

    Ok(())
}

/// Main install task
pub async fn run_install_openclaw(state: AppState, task_id: String, req: InstallRequest) {
    let update = |f: &dyn Fn(&mut TaskState)| {
        if let Some(t) = state.tasks.get(&task_id) {
            t.update(f);
        }
    };

    // Check if already installed
    update(&|t| {
        t.status = TaskStatus::Running;
        t.progress = 0;
        t.current_step = "检查安装状态".to_string();
        t.log("🔍 检查 OpenClaw 安装状态...");
    });

    if let Some(ver) = check_openclaw_installed(&req.version) {
        update(&|t| {
            t.status = TaskStatus::Success;
            t.progress = 100;
            t.current_step = "已安装".to_string();
            t.log(&format!("✅ OpenClaw {} 已安装，跳过", ver.trim()));
            t.completed_at = Some(chrono::Utc::now());
        });
        return;
    }

    update(&|t| {
        t.log(&format!("   平台: {}, 架构: {}", req.platform, req.arch));
        t.log(&format!("   目标版本: {}", req.version));
    });

    let dir = install_dir(&req.version);
    let pkgs_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".clawpilot")
        .join("openclaw-pkgs");
    fs::create_dir_all(&pkgs_dir).ok();

    let tar_filename = format!("openclaw-pkgs-v{}-{}-{}.tar.gz", req.version, req.platform, req.arch);
    let tar_path = pkgs_dir.join(&tar_filename);
    let sha256_path = pkgs_dir.join(format!("{}.sha256", tar_filename));

    // Check cache
    let tar_exists = tar_path.exists() && sha256_path.exists();
    if tar_exists {
        update(&|t| {
            t.progress = 10;
            t.current_step = "使用缓存包".to_string();
            t.log(&format!("✅ 使用已缓存包: {}", tar_path.display()));
        });
    } else {
        // Download package
        update(&|t| {
            t.progress = 10;
            t.current_step = "下载离线包".to_string();
            t.log(&format!("📥 下载离线包: {}", req.download_url));
        });

        let task_id_clone = task_id.clone();
        let state_clone = state.clone();
        let download_result = download_file(&req.download_url, &tar_path, move |downloaded, total| {
            if total > 0 {
                let pct = 10 + (downloaded as f64 / total as f64 * 50.0) as u8;
                if let Some(t) = state_clone.tasks.get(&task_id_clone) {
                    t.update(|s| {
                        s.progress = pct.min(60);
                        s.current_step = format!("下载中 {}%", pct);
                    });
                }
            }
        }).await;

        if let Err(e) = download_result {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(e.to_string());
                t.log(&format!("❌ 下载失败: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }

        // Download SHA256
        update(&|t| {
            t.progress = 62;
            t.current_step = "下载校验文件".to_string();
            t.log("🔐 下载 SHA256 校验文件...");
        });

        if let Err(e) = download_file(&req.sha256_url, &sha256_path, |_, _| {}).await {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("SHA256 文件下载失败: {}", e));
                t.log(&format!("❌ SHA256 文件下载失败: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }
    }

    // Verify SHA256
    update(&|t| {
        t.progress = 65;
        t.current_step = "校验完整性".to_string();
        t.log("🔐 校验 SHA256...");
    });

    if let Err(e) = verify_file_sha256(&sha256_path) {
        update(&|t| {
            t.status = TaskStatus::Failed;
            t.error = Some(e.to_string());
            t.log(&format!("❌ SHA256 校验失败: {}", e));
            t.completed_at = Some(chrono::Utc::now());
        });
        return;
    }
    update(&|t| {
        t.log("✅ SHA256 校验通过");
    });

    // Extract
    update(&|t| {
        t.progress = 70;
        t.current_step = "解压离线包".to_string();
        t.log("📦 解压离线包...");
    });

    match tokio::task::spawn_blocking({
        let tar_path = tar_path.clone();
        let dir = dir.clone();
        move || extract_tarball(&tar_path, &dir)
    }).await {
        Ok(Ok(_)) => {
            update(&|t| {
                t.progress = 85;
                t.current_step = "创建链接".to_string();
                t.log(&format!("✅ 解压完成: {}", dir.display()));
            });
        }
        Ok(Err(e)) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("解压失败: {}", e));
                t.log(&format!("❌ 解压失败: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }
        Err(e) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("解压 panic: {}", e));
                t.log(&format!("❌ 解压异常: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }
    }

    // Create symlink
    update(&|t| {
        t.current_step = "创建链接".to_string();
        t.log("🔗 创建 symlink...");
    });

    if let Err(e) = create_symlink(&dir) {
        update(&|t| {
            t.log(&format!("⚠️  symlink 创建失败（不影响运行）: {}", e));
        });
    } else {
        update(&|t| {
            t.log(&format!("✅ ~/.openclaw/current -> openclaw-v{}", req.version));
        });
    }

    // Run onboard
    update(&|t| {
        t.progress = 90;
        t.current_step = "注册系统服务".to_string();
        t.log("⚙️  注册系统服务...");
    });

    match tokio::task::spawn_blocking({
        let dir = dir.clone();
        move || run_onboard(&dir)
    }).await {
        Ok(Ok(_)) => {
            update(&|t| {
                t.progress = 95;
                t.current_step = "验证安装".to_string();
                t.log("✅ 系统服务已注册");
            });
        }
        Ok(Err(e)) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("onboard 失败: {}", e));
                t.log(&format!("❌ onboard 失败: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }
        Err(e) => {
            update(&|t| {
                t.status = TaskStatus::Failed;
                t.error = Some(format!("onboard panic: {}", e));
                t.log(&format!("❌ onboard 异常: {}", e));
                t.completed_at = Some(chrono::Utc::now());
            });
            return;
        }
    }

    // Final verification
    update(&|t| t.log("🔍 验证安装..."));

    if let Some(ver) = check_openclaw_installed(&req.version) {
        update(&|t| {
            t.status = TaskStatus::Success;
            t.progress = 100;
            t.current_step = "已就绪".to_string();
            t.log(&format!("✅ OpenClaw 已就绪: {}", ver.trim()));
            t.completed_at = Some(chrono::Utc::now());
        });
    } else {
        update(&|t| {
            t.status = TaskStatus::Failed;
            t.error = Some("安装完成但验证失败".to_string());
            t.log("⚠️  安装完成但验证失败（可能需要重新登录）");
            t.progress = 95;
            t.completed_at = Some(chrono::Utc::now());
        });
    }
}
