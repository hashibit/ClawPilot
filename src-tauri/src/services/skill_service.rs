use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::skill::SkillInfo;
use uuid::Uuid;
use std::io::Cursor;
use zip::ZipArchive;
use std::fs;
use std::path::PathBuf;

/// Local skill input for create_skill command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LocalSkillInput {
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Skill installation result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillInstallResult {
    pub ok: bool,
    pub skill: Option<SkillInfo>,
    pub error: Option<String>,
}

/// CLAWHUB_BASE URL for downloading skills
const CLAWHUB_BASE: &str = "https://lightmake.site/api";

/// Get the skills directory
fn get_skills_dir() -> Result<std::path::PathBuf> {
    let app_data_dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Validation("无法获取应用数据目录".into()))?
        .join("ClawPilot")
        .join("skills");

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| AppError::Validation(format!("创建技能目录失败：{}", e)))?;

    Ok(app_data_dir)
}

pub fn get_skills(pool: &DbPool) -> Result<Vec<SkillInfo>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, slug, description, author, size, url, version,
                tags, category, downloads, is_builtin, last_synced
         FROM skills ORDER BY name",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SkillInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                slug: row.get(2)?,
                description: row.get(3)?,
                author: row.get(4)?,
                size: row.get(5)?,
                url: row.get(6)?,
                version: row.get(7)?,
                tags: row.get::<_, Option<String>>(8)?
                    .map(|s| serde_json::from_str(&s).unwrap_or_default())
                    .unwrap_or_default(),
                category: row.get(9)?,
                downloads: row.get(10)?,
                is_builtin: row.get::<_, i64>(11)? != 0,
                last_synced: row.get(12)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

/// Stub: syncs skills from clawhub.ai (HTTP not implemented yet)
pub fn sync_skills_from_clawhub(_pool: &DbPool) -> Result<Vec<SkillInfo>> {
    Ok(vec![])
}

/// Create a new local skill
pub fn create_skill(pool: &DbPool, skill: LocalSkillInput) -> Result<i64> {
    let conn = pool.get()?;

    // Validate inputs
    if skill.name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if skill.display_name.trim().is_empty() {
        return Err(AppError::Validation("display_name is required".into()));
    }

    // Generate unique id and slug
    let id = Uuid::new_v4().to_string();
    let slug = skill.name.trim().to_lowercase().replace(' ', "-");

    // Check for duplicate name or slug
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM skills WHERE name = ?1 OR slug = ?2)",
            rusqlite::params![skill.name.trim(), &slug],
            |row| row.get(0),
        )?;

    if exists {
        return Err(AppError::Validation("技能名称已存在".into()));
    }

    let ts = chrono::Utc::now().timestamp();

    conn.execute(
        r#"INSERT INTO skills (id, name, slug, description, category, updated_at, is_builtin, last_synced)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)"#,
        rusqlite::params![
            id,
            skill.name.trim(),
            slug,
            skill.description.as_ref().map(|s| s.trim()).unwrap_or(""),
            skill.category.as_ref().map(|s| s.trim()).unwrap_or("general"),
            ts,
            ts,
        ],
    )?;

    Ok(0)
}

/// Delete a local skill by id
pub fn delete_skill(pool: &DbPool, id: String) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM skills WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

/// Download and install a skill from clawhub
pub async fn install_skill(pool: &DbPool, slug: String) -> Result<SkillInstallResult> {
    let download_url = format!("{}/{}/download", CLAWHUB_BASE, slug);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Validation(format!("HTTP 客户端创建失败：{}", e)))?;

    // Download the skill ZIP file
    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| AppError::Validation(format!("下载技能失败：{}", e)))?;

    if !resp.status().is_success() {
        return Ok(SkillInstallResult {
            ok: false,
            skill: None,
            error: Some(format!("下载失败：HTTP {}", resp.status())),
        });
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Validation(format!("读取响应失败：{}", e)))?;

    // Get skills directory
    let skills_dir = get_skills_dir()?;
    let skill_dir = skills_dir.join(&slug);

    // Remove existing skill directory
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir).ok();
    }
    fs::create_dir_all(&skill_dir)
        .map_err(|e| AppError::Validation(format!("创建技能目录失败：{}", e)))?;

    // Extract ZIP file
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| AppError::Validation(format!("ZIP 解压失败：{}", e)))?;

    let mut extracted_paths = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| AppError::Validation(format!("ZIP 文件索引失败：{}", e)))?;

        let outpath = match file.enclosed_name() {
            Some(path) => skill_dir.join(path),
            None => continue,
        };

        extracted_paths.push(outpath.clone());

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).ok();
            }
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| AppError::Validation(format!("创建文件失败：{}", e)))?;
            std::io::copy(&mut file, &mut outfile).ok();
        }
    }

    // Handle nested directory (if ZIP contains a single folder)
    if extracted_paths.len() == 1 && extracted_paths[0].is_dir() {
        let nested = &extracted_paths[0];
        if let Ok(entries) = fs::read_dir(nested) {
            for entry in entries.flatten() {
                let src = entry.path();
                let dst = skill_dir.join(entry.file_name());
                fs::rename(&src, &dst).ok();
            }
            fs::remove_dir(nested).ok();
        }
    }

    let ts = chrono::Utc::now().timestamp();

    // Check if skill exists
    let exists: bool = pool.get()?
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM skills WHERE slug = ?1)",
            rusqlite::params![&slug],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        // Update existing skill
        pool.get()?.execute(
            r#"UPDATE skills SET is_installed = 1, updated_at = ?1, last_synced = ?1 WHERE slug = ?2"#,
            rusqlite::params![ts, &slug],
        ).map_err(|e| AppError::Database(e))?;
    } else {
        // Insert new skill
        let id = Uuid::new_v4().to_string();
        pool.get()?.execute(
            r#"INSERT INTO skills (id, name, slug, description, category, updated_at, is_builtin, last_synced)
               VALUES (?1, ?2, ?3, '', 'general', ?4, 0, ?5)"#,
            rusqlite::params![id, slug, slug, ts, ts],
        ).map_err(|e| AppError::Database(e))?;
    }

    Ok(SkillInstallResult {
        ok: true,
        skill: None,
        error: None,
    })
}

/// Uninstall a skill by slug
pub async fn uninstall_skill(pool: &DbPool, slug: String) -> Result<serde_json::Value> {
    let skills_dir = get_skills_dir()?;
    let skill_dir = skills_dir.join(&slug);

    // Remove skill directory
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir)
            .map_err(|e| AppError::Validation(format!("删除技能目录失败：{}", e)))?;
    }

    // Remove from database
    pool.get()?.execute(
        "DELETE FROM skills WHERE slug = ?1",
        rusqlite::params![&slug],
    ).map_err(|e| AppError::Database(e))?;

    Ok(serde_json::json!({ "ok": true }))
}

/// Search for skills from clawhub
pub async fn search_skills(_q: String, _source: Option<String>, _limit: Option<i64>) -> Result<Vec<SkillInfo>> {
    // Simplified: return empty list for now
    Ok(vec![])
}

/// Bundle skills metadata structure
#[derive(Debug, serde::Deserialize)]
struct BundleSkillsMetadata {
    skills: Vec<BundleSkillInfo>,
}

#[derive(Debug, serde::Deserialize)]
struct BundleSkillInfo {
    slug: String,
    name: String,
    display_name: String,
    description: String,
    #[serde(default)]
    category: String,
}

/// Load bundle skills metadata from JSON file
fn load_bundle_skills_metadata() -> Result<Option<BundleSkillsMetadata>> {
    let metadata_path = get_bundle_skills_metadata_path()?;

    if !metadata_path.exists() {
        tracing::warn!("Bundle skills metadata file not found: {:?}", metadata_path);
        return Ok(None);
    }

    let content = fs::read_to_string(&metadata_path)
        .map_err(|e| AppError::Validation(format!("读取技能元数据文件失败：{}", e)))?;

    let metadata: BundleSkillsMetadata = serde_json::from_str(&content)
        .map_err(|e| AppError::Validation(format!("解析技能元数据 JSON 失败：{}", e)))?;

    Ok(Some(metadata))
}

/// Get the bundle skills metadata file path
fn get_bundle_skills_metadata_path() -> Result<PathBuf> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| AppError::Validation(format!("获取可执行文件路径失败：{}", e)))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::Validation("无法获取可执行文件目录".into()))?;

    let possible_paths = vec![
        exe_dir.parent().map(|p| p.join("bundle/bundled-skills-metadata.json")),
        Some(exe_dir.join("bundle/bundled-skills-metadata.json")),
        exe_dir.parent().map(|p| p.join("Resources/bundle/bundled-skills-metadata.json")),
    ];

    for path in possible_paths.into_iter().flatten() {
        if path.exists() {
            return Ok(path);
        }
    }

    Ok(PathBuf::from("bundle/bundled-skills-metadata.json"))
}

/// Register bundle skills from the project's bundle/skills directory
/// Uses bundled-skills-metadata.json as the single source of truth
pub fn register_bundle_skills(pool: &DbPool) -> Result<()> {
    let metadata = match load_bundle_skills_metadata()? {
        Some(m) => m,
        None => {
            tracing::info!("No bundle skills metadata found, skipping registration");
            return Ok(());
        }
    };

    let ts = chrono::Utc::now().timestamp();
    let mut registered = 0;

    for skill in &metadata.skills {
        let skill_dir = get_bundle_skills_dir()?.join(&skill.slug);

        if !skill_dir.exists() {
            tracing::warn!("Skill directory not found: {}, skipping", skill.slug);
            continue;
        }

        let conn = pool.get()?;

        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM skills WHERE slug = ?1)",
            rusqlite::params![&skill.slug],
            |row| row.get(0),
        ).unwrap_or(false);

        if exists {
            conn.execute(
                r#"UPDATE skills SET
                    display_name = ?1,
                    description = ?2,
                    category = ?3,
                    is_installed = 1,
                    install_path = ?4,
                    updated_at = ?5
                   WHERE slug = ?6"#,
                rusqlite::params![
                    skill.display_name,
                    skill.description,
                    skill.category,
                    skill_dir.to_string_lossy(),
                    ts,
                    &skill.slug
                ],
            ).map_err(|e| AppError::Database(e))?;
        } else {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                r#"INSERT INTO skills
                    (id, name, display_name, description, slug, category, is_installed, install_path, created_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9)"#,
                rusqlite::params![
                    id,
                    skill.name,
                    skill.display_name,
                    skill.description,
                    skill.slug,
                    skill.category,
                    skill_dir.to_string_lossy(),
                    ts,
                    ts
                ],
            ).map_err(|e| AppError::Database(e))?;
            registered += 1;
        }
    }

    tracing::info!("Registered {} bundle skills", registered);
    Ok(())
}

/// Get the bundle skills directory path
fn get_bundle_skills_dir() -> Result<PathBuf> {
    // Try to find bundle/skills relative to the executable
    let exe_dir = std::env::current_exe()
        .map_err(|e| AppError::Validation(format!("获取可执行文件路径失败：{}", e)))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::Validation("无法获取可执行文件目录".into()))?;

    // Try multiple possible locations:
    // 1. ../bundle/skills (for development, exe is in target/)
    // 2. bundle/skills (for production, exe is in app bundle)
    // 3. Resources/bundle/skills (for macOS app bundle)

    let possible_paths = vec![
        exe_dir.parent().map(|p| p.join("bundle/skills")),
        Some(exe_dir.join("bundle/skills")),
        exe_dir.parent().map(|p| p.join("Resources/bundle/skills")),
    ];

    for path in possible_paths.into_iter().flatten() {
        if path.exists() {
            return Ok(path);
        }
    }

    // Fallback to a default path relative to current directory
    Ok(PathBuf::from("bundle/skills"))
}
