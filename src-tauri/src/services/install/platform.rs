use std::process::Command;
use std::path::PathBuf;
use std::fs;

use crate::error::{AppError, Result};

/// GitHub release repo for downloading daemon binaries
pub const RELEASE_REPO: &str = "hashibit/clawpilot-releases";

/// 操作系统类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsType {
    MacOS,
    Linux,
}

/// CPU 架构
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    Arm64,
    X64,
}

impl OsType {
    /// 探测当前操作系统类型
    pub fn detect() -> Result<Self> {
        #[cfg(target_os = "macos")]
        return Ok(OsType::MacOS);

        #[cfg(target_os = "linux")]
        return Ok(OsType::Linux);

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        return Err(AppError::Validation(
            "不支持的操作系统，仅支持 macOS 和 Linux".to_string()
        ));
    }

    /// 探测远程操作系统类型（通过 SSH）
    pub fn detect_remote(ssh_prefix: &str, target: &str) -> Result<Self> {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("{} {} 'uname -s'", ssh_prefix, target))
            .output()
            .map_err(|e| AppError::Io(e))?;

        if !output.status.success() {
            return Err(AppError::Internal("无法探测远程系统类型".to_string()));
        }

        let os_name = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();

        match os_name.as_str() {
            "darwin" => Ok(OsType::MacOS),
            "linux" => Ok(OsType::Linux),
            _ => Err(AppError::Validation(format!(
                "不支持的远程操作系统：{}", os_name
            ))),
        }
    }

    /// 资源文件中的平台后缀
    pub fn resource_suffix(self) -> &'static str {
        match self {
            OsType::MacOS => "macos",
            OsType::Linux => "linux",
        }
    }
}

impl Arch {
    /// 探测当前 CPU 架构
    pub fn detect() -> Result<Self> {
        let output = Command::new("uname")
            .arg("-m")
            .output()
            .map_err(|e| AppError::Io(e))?;

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Self::from_uname(&raw))
    }

    /// 探测远程 CPU 架构（通过 SSH）
    pub fn detect_remote(ssh_prefix: &str, target: &str) -> Result<Self> {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("{} {} 'uname -m'", ssh_prefix, target))
            .output()
            .map_err(|e| AppError::Io(e))?;

        if !output.status.success() {
            return Err(AppError::Internal("无法探测远程架构".to_string()));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Self::from_uname(&raw))
    }

    /// 从 uname -m 输出归一化
    pub fn from_uname(raw: &str) -> Self {
        match raw {
            "arm64" | "aarch64" => Arch::Arm64,
            _ => Arch::X64,
        }
    }

    /// 资源文件中的架构后缀
    pub fn resource_suffix(self) -> &'static str {
        match self {
            Arch::Arm64 => "arm64",
            Arch::X64 => "x64",
        }
    }
}

/// 获取 daemon 安装目录 (~/.clawpilot/bin/)
pub fn get_daemon_bin_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let bin_dir = home.join(".clawpilot").join("bin");
    fs::create_dir_all(&bin_dir)?;

    Ok(bin_dir)
}

/// 获取 daemon 日志目录 (~/.clawpilot/logs/)
pub fn get_daemon_logs_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;

    let logs_dir = home.join(".clawpilot").join("logs");
    fs::create_dir_all(&logs_dir)?;

    Ok(logs_dir)
}

/// 获取 daemon binary 路径
pub fn get_daemon_binary_path() -> Result<PathBuf> {
    Ok(get_daemon_bin_dir()?.join("clawpilot-daemon"))
}

/// 判断是否在开发模式（未打包的 Tauri 环境）
pub fn is_dev_mode() -> bool {
    // In dev mode, CARGO_MANIFEST_DIR is set at compile time and the exe is in target/debug
    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let exe_str = current_exe.to_string_lossy();
    // Dev mode: running from target/debug or via cargo
    exe_str.contains("target/debug") || exe_str.contains("target/release/clawpilot")
}

/// 获取 daemon 缓存目录 (~/.clawpilot/bin/cache/)
pub fn get_daemon_cache_dir() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::NotFound("home 目录不存在".to_string()))?;
    let cache_dir = home.join(".clawpilot").join("bin").join("cache");
    fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir)
}

/// 从 Tauri bundle 中复制对应平台和架构的 daemon binary
pub fn copy_daemon_from_bundle(dest_path: &PathBuf, os: OsType, arch: Arch) -> Result<()> {
    let current_exe = std::env::current_exe()?;

    // 资源搜索路径
    #[cfg(target_os = "macos")]
    let resource_paths: Vec<PathBuf> = vec![
        current_exe.parent().map(|p| p.join("../Resources")).unwrap(),
        PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources")),
    ];

    #[cfg(target_os = "linux")]
    let resource_paths: Vec<PathBuf> = vec![
        current_exe.parent().map(|p| p.join("resources")).unwrap(),
        current_exe.parent().map(|p| p.to_path_buf()).unwrap(),
        PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources")),
    ];

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let resource_paths: Vec<PathBuf> = vec![];

    // 目标 binary 文件名：clawpilot-daemon-{os}-{arch}
    let target_name = format!("clawpilot-daemon-{}-{}", os.resource_suffix(), arch.resource_suffix());

    for resource_dir in &resource_paths {
        let entries = match fs::read_dir(resource_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().map(|n| n.to_string_lossy()) {
                if name == target_name.as_str() {
                    fs::copy(&path, dest_path)?;
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let mut perms = fs::metadata(dest_path)?.permissions();
                        perms.set_mode(0o755);
                        fs::set_permissions(dest_path, perms)?;
                    }
                    return Ok(());
                }
            }
        }
    }

    Err(AppError::NotFound(
        format!("daemon binary not found in bundle: {}. Please ensure the daemon is built and bundled.", target_name)
    ))
}

/// 从 GitHub Releases 下载 daemon binary 到本地缓存
///
/// 下载路径: ~/.clawpilot/bin/cache/clawpilot-daemon-{os}-{arch}
/// Release asset 命名: clawpilot-daemon-v{version}-{os}-{arch}
pub fn download_daemon_from_release(dest_path: &PathBuf, os: OsType, arch: Arch) -> Result<()> {
    let os_suffix = os.resource_suffix();
    let arch_suffix = arch.resource_suffix();

    // 1. Query latest release tag from GitHub API
    tracing::info!("查询 {} 最新 release...", RELEASE_REPO);
    let tag_output = Command::new("gh")
        .args(["release", "view", "--repo", RELEASE_REPO, "--json", "tagName", "-q", ".tagName"])
        .output()
        .map_err(|e| AppError::Internal(format!("gh CLI 不可用: {}", e)))?;

    if !tag_output.status.success() {
        return Err(AppError::Internal(format!(
            "获取最新 release 失败: {}",
            String::from_utf8_lossy(&tag_output.stderr)
        )));
    }

    let tag = String::from_utf8_lossy(&tag_output.stdout).trim().to_string();
    if tag.is_empty() {
        return Err(AppError::NotFound("GitHub release 不存在，请先发布".to_string()));
    }

    // 2. Build asset name pattern: clawpilot-daemon-v*-{os}-{arch}
    let asset_pattern = format!("clawpilot-daemon-*-{}-{}", os_suffix, arch_suffix);

    // 3. Download via gh release download
    let cache_dir = get_daemon_cache_dir()?;
    tracing::info!("从 release {} 下载 daemon ({}-{})...", tag, os_suffix, arch_suffix);

    let dl_output = Command::new("gh")
        .args([
            "release", "download", &tag,
            "--repo", RELEASE_REPO,
            "--pattern", &asset_pattern,
            "--dir", &cache_dir.to_string_lossy(),
            "--clobber",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("gh release download 失败: {}", e)))?;

    if !dl_output.status.success() {
        return Err(AppError::Internal(format!(
            "下载 daemon binary 失败: {}",
            String::from_utf8_lossy(&dl_output.stderr)
        )));
    }

    // 4. Find the downloaded file (clawpilot-daemon-v{version}-{os}-{arch})
    let prefix = format!("clawpilot-daemon-");
    let suffix = format!("-{}-{}", os_suffix, arch_suffix);
    let mut found = None;
    for entry in fs::read_dir(&cache_dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(&prefix) && name.ends_with(&suffix) {
            found = Some(entry.path());
            break;
        }
    }

    let downloaded_path = found.ok_or_else(|| {
        AppError::NotFound(format!(
            "下载完成但未找到匹配文件: {}-{}", os_suffix, arch_suffix
        ))
    })?;

    // 5. Copy to dest and make executable
    fs::copy(&downloaded_path, dest_path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(dest_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(dest_path, perms)?;
    }

    tracing::info!("daemon binary 已下载到 {}", dest_path.display());
    Ok(())
}

/// 获取 daemon binary：先从 bundle 复制，失败则从 GitHub Releases 下载
pub fn resolve_daemon_binary(dest_path: &PathBuf, os: OsType, arch: Arch) -> Result<()> {
    // Dev mode: only try bundle/local resources
    if is_dev_mode() {
        return copy_daemon_from_bundle(dest_path, os, arch);
    }

    // Production: try bundle first, then download
    match copy_daemon_from_bundle(dest_path, os, arch) {
        Ok(()) => Ok(()),
        Err(_) => {
            tracing::info!("bundle 中未找到 daemon，尝试从 GitHub Releases 下载...");
            download_daemon_from_release(dest_path, os, arch)
        }
    }
}

/// 从 SSH 前缀字符串中提取 `-i "key_path"` 选项（用于 SCP 命令）
pub fn extract_ssh_key_arg(ssh_prefix: &str) -> String {
    if let Some(start) = ssh_prefix.find("-i \"") {
        let rest = &ssh_prefix[start + 4..];
        if let Some(end) = rest.find('"') {
            return format!("-i \"{}\" ", &rest[..end]);
        }
    }
    String::new()
}

/// 从 SSH 前缀字符串中提取端口号（用于 SCP 的 -P 选项）
pub fn extract_ssh_port(ssh_prefix: &str) -> Option<u16> {
    let parts: Vec<&str> = ssh_prefix.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "-p" {
            if let Some(port_str) = parts.get(i + 1) {
                if let Ok(port) = port_str.parse::<u16>() {
                    return Some(port);
                }
            }
        }
    }
    None
}
