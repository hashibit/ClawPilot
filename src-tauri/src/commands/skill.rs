use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::skill::SkillInfo;
use crate::services::skill_service::{self, LocalSkillInput};

#[tauri::command]
pub fn get_skills(pool: State<'_, DbPool>) -> Result<Vec<SkillInfo>> {
    skill_service::get_skills(&pool)
}

#[tauri::command]
pub fn sync_skills_from_clawhub(pool: State<'_, DbPool>) -> Result<Vec<SkillInfo>> {
    skill_service::sync_skills_from_clawhub(&pool)
}

#[tauri::command]
pub fn create_skill(pool: State<'_, DbPool>, skill: LocalSkillInput) -> Result<i64> {
    skill_service::create_skill(&pool, skill)
}

#[tauri::command]
pub fn delete_skill(pool: State<'_, DbPool>, id: String) -> Result<()> {
    skill_service::delete_skill(&pool, id)
}

/// Install a skill from clawhub
#[tauri::command]
pub async fn install_skill(pool: State<'_, DbPool>, slug: String) -> Result<serde_json::Value> {
    match skill_service::install_skill(&pool, slug).await {
        Ok(result) => Ok(serde_json::json!({
            "ok": result.ok,
            "error": result.error
        })),
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

/// Uninstall a skill
#[tauri::command]
pub async fn uninstall_skill(pool: State<'_, DbPool>, slug: String) -> Result<serde_json::Value> {
    match skill_service::uninstall_skill(&pool, slug).await {
        Ok(result) => Ok(result),
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

/// Search for skills from clawhub
#[tauri::command]
pub async fn search_skills(q: String, source: Option<String>, limit: Option<i64>) -> serde_json::Value {
    match skill_service::search_skills(q, source, limit).await {
        Ok(skills) => serde_json::json!({
            "ok": true,
            "skills": skills
        }),
        Err(e) => serde_json::json!({
            "ok": false,
            "error": e.to_string()
        }),
    }
}
