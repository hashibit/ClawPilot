use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::skill::SkillInfo;
use rusqlite::OptionalExtension;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use zip::ZipArchive;

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
        "SELECT id, name, display_name, description, category, slug, version, author,
                tags, url, download_url, is_local, is_installed, install_path, installed_at, created_at
         FROM skills ORDER BY is_installed DESC, created_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SkillInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                display_name: row.get(2)?,
                description: row.get(3)?,
                category: row.get(4)?,
                slug: row.get(5)?,
                version: row.get(6)?,
                author: row.get(7)?,
                tags: row
                    .get::<_, Option<String>>(8)?
                    .as_deref()
                    .map(SkillInfo::tags_from_json)
                    .unwrap_or_default(),
                url: row.get(9)?,
                download_url: row.get(10)?,
                is_local: row.get::<_, i64>(11)? != 0,
                is_installed: row.get::<_, i64>(12)? != 0,
                install_path: row.get(13)?,
                installed_at: row.get(14)?,
                created_at: row.get(15)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

/// 返回 bundle 技能元数据（与 Node.js /get_bundle_skills_metadata 等价）
/// 从 DB 读取内置技能，构造 { skills: [...] } JSON。
pub fn get_bundle_skills_metadata(pool: &DbPool) -> Result<serde_json::Value> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT slug, name, COALESCE(NULLIF(display_name, ''), name), description, category, is_local \
         FROM skills ORDER BY name",
    )?;
    let skill_list: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .map(|(slug, name, display_name, description, category, is_local)| {
            serde_json::json!({
                "slug": slug,
                "name": name,
                "display_name": display_name,
                "description": description.unwrap_or_default(),
                "category": category.unwrap_or_else(|| "general".to_string()),
                "is_local": is_local != 0,
            })
        })
        .collect();
    Ok(serde_json::json!({ "skills": skill_list }))
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

    // Check for duplicate name
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM skills WHERE name = ?1)",
        rusqlite::params![skill.name.trim()],
        |row| row.get(0),
    )?;

    if exists {
        return Err(AppError::Validation("技能名称已存在".into()));
    }

    let ts = chrono::Utc::now().timestamp();

    conn.execute(
        r#"INSERT INTO skills (name, display_name, description, category, is_local, is_installed, created_at)
           VALUES (?1, ?2, ?3, ?4, 1, 0, ?5)"#,
        rusqlite::params![
            skill.name.trim(),
            skill.display_name.trim(),
            skill.description.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            skill.category.as_ref().map(|s| s.trim()).unwrap_or("general"),
            ts,
        ],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Delete a local skill by id (only if is_local = 1)
pub fn delete_skill(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM skills WHERE id = ?1 AND is_local = 1",
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
        let mut file = archive
            .by_index(i)
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
    let install_path = skill_dir.to_string_lossy().to_string();

    // Check if skill exists by slug
    let exists: bool = pool
        .get()?
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM skills WHERE slug = ?1)",
            rusqlite::params![&slug],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        // Update existing skill
        pool.get()?.execute(
            r#"UPDATE skills SET is_installed = 1, install_path = ?1, installed_at = ?2, last_synced = ?3 WHERE slug = ?4"#,
            rusqlite::params![install_path, ts, ts, &slug],
        ).map_err(AppError::Database)?;
    } else {
        // Insert new skill
        pool.get()?.execute(
            r#"INSERT INTO skills (name, display_name, description, slug, category, url, download_url,
                                   version, author, is_local, is_installed, install_path, installed_at,
                                   created_at, last_synced)
               VALUES (?1, ?2, '', ?3, 'general', NULL, NULL, NULL, NULL, 0, 1, ?4, ?5, ?6, ?7)"#,
            rusqlite::params![slug, slug, slug, install_path, ts, ts, ts],
        ).map_err(AppError::Database)?;
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

    // Check if skill is local — if local, just clear install info; if remote, delete record
    let conn = pool.get()?;
    let is_local: Option<i64> = conn
        .query_row(
            "SELECT is_local FROM skills WHERE slug = ?1",
            rusqlite::params![&slug],
            |row| row.get(0),
        )
        .optional()
        .map_err(AppError::Database)?;

    match is_local {
        Some(1) => {
            // Local skill: just clear install state
            conn.execute(
                "UPDATE skills SET is_installed = 0, install_path = NULL, installed_at = NULL WHERE slug = ?1",
                rusqlite::params![&slug],
            )
            .map_err(AppError::Database)?;
        }
        Some(_) => {
            // Remote skill: delete the record
            conn.execute(
                "DELETE FROM skills WHERE slug = ?1",
                rusqlite::params![&slug],
            )
            .map_err(AppError::Database)?;
        }
        None => {
            // Not found, no action needed
        }
    }

    Ok(serde_json::json!({ "ok": true }))
}

/// Search for skills from clawhub
pub async fn search_skills(
    _q: String,
    _source: Option<String>,
    _limit: Option<i64>,
) -> Result<Vec<SkillInfo>> {
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
        exe_dir
            .parent()
            .map(|p| p.join("bundle/bundled-skills-metadata.json")),
        Some(exe_dir.join("bundle/bundled-skills-metadata.json")),
        exe_dir
            .parent()
            .map(|p| p.join("Resources/bundle/bundled-skills-metadata.json")),
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

        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM skills WHERE slug = ?1)",
                rusqlite::params![&skill.slug],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            conn.execute(
                r#"UPDATE skills SET
                    display_name = ?1,
                    description = ?2,
                    category = ?3,
                    is_installed = 1,
                    install_path = ?4
                   WHERE slug = ?5"#,
                rusqlite::params![
                    skill.display_name,
                    skill.description,
                    skill.category,
                    skill_dir.to_string_lossy(),
                    &skill.slug
                ],
            )
            .map_err(AppError::Database)?;
        } else {
            conn.execute(
                r#"INSERT INTO skills
                    (name, display_name, description, slug, category, is_local, is_installed, install_path, created_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, 0, 1, ?6, ?7)"#,
                rusqlite::params![
                    skill.name,
                    skill.display_name,
                    skill.description,
                    skill.slug,
                    skill.category,
                    skill_dir.to_string_lossy(),
                    ts
                ],
            )
            .map_err(AppError::Database)?;
            registered += 1;
        }
    }

    tracing::info!("Registered {} bundle skills", registered);
    Ok(())
}

/// Get the bundle skills directory path
fn get_bundle_skills_dir() -> Result<PathBuf> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| AppError::Validation(format!("获取可执行文件路径失败：{}", e)))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::Validation("无法获取可执行文件目录".into()))?;

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

    Ok(PathBuf::from("bundle/skills"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    // --- get_skills 测试 ---
    #[test]
    fn test_get_skills_empty() {
        let pool = setup();

        let result = get_skills(&pool);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // --- create_skill 测试 ---
    #[test]
    fn test_create_skill() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "test-skill".to_string(),
            display_name: "Test Skill".to_string(),
            description: Some("A test skill".to_string()),
            category: Some("general".to_string()),
        };

        let result = create_skill(&pool, input);
        assert!(result.is_ok());
        let id = result.unwrap();
        assert!(id > 0);
    }

    #[test]
    fn test_create_skill_requires_name() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "".to_string(),
            display_name: "Test".to_string(),
            description: None,
            category: None,
        };

        let result = create_skill(&pool, input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("name is required"));
    }

    #[test]
    fn test_create_skill_requires_display_name() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "test".to_string(),
            display_name: "".to_string(),
            description: None,
            category: None,
        };

        let result = create_skill(&pool, input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("display_name is required"));
    }

    #[test]
    fn test_create_skill_prevents_duplicates() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "duplicate-skill".to_string(),
            display_name: "Duplicate".to_string(),
            description: None,
            category: None,
        };

        create_skill(&pool, input.clone()).unwrap();

        let result = create_skill(&pool, input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("技能名称已存在"));
    }

    #[test]
    fn test_create_skill_trims_whitespace() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "  test-skill  ".to_string(),
            display_name: "  Test Skill  ".to_string(),
            description: Some("  Description  ".to_string()),
            category: Some("  general  ".to_string()),
        };

        let result = create_skill(&pool, input);
        assert!(result.is_ok());

        let skills = get_skills(&pool).unwrap();
        assert_eq!(skills[0].name, "test-skill");
        assert_eq!(skills[0].description, Some("Description".to_string()));
    }

    // --- delete_skill 测试 ---
    #[test]
    fn test_delete_skill() {
        let pool = setup();

        let input = LocalSkillInput {
            name: "to-delete".to_string(),
            display_name: "To Delete".to_string(),
            description: None,
            category: None,
        };

        let id = create_skill(&pool, input).unwrap();

        let result = delete_skill(&pool, id);
        assert!(result.is_ok());

        let skills = get_skills(&pool).unwrap();
        assert!(skills.is_empty());
    }

    // --- sync_skills_from_clawhub 测试 ---
    #[test]
    fn test_sync_skills_from_clawhub_returns_empty() {
        let pool = setup();

        let result = sync_skills_from_clawhub(&pool);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // --- LocalSkillInput 测试 ---
    #[test]
    fn test_local_skill_input_serde() {
        let input = LocalSkillInput {
            name: "test".to_string(),
            display_name: "Test".to_string(),
            description: Some("Description".to_string()),
            category: Some("general".to_string()),
        };

        let json = serde_json::to_string(&input).unwrap();
        let parsed: LocalSkillInput = serde_json::from_str(&json).unwrap();

        assert_eq!(input.name, parsed.name);
        assert_eq!(input.display_name, parsed.display_name);
        assert_eq!(input.description, parsed.description);
        assert_eq!(input.category, parsed.category);
    }

    // --- SkillInstallResult 测试 ---
    #[test]
    fn test_skill_install_result_serde() {
        let result = SkillInstallResult {
            ok: true,
            skill: None,
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: SkillInstallResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
    }

    #[test]
    fn test_skill_install_result_error() {
        let result = SkillInstallResult {
            ok: false,
            skill: None,
            error: Some("Download failed".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: SkillInstallResult = serde_json::from_str(&json).unwrap();

        assert!(!parsed.ok);
        assert_eq!(parsed.error, Some("Download failed".to_string()));
    }
}
