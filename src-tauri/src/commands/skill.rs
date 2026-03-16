use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::skill::SkillInfo;
use crate::services::skill_service;

#[tauri::command]
pub fn get_skills(pool: State<'_, DbPool>) -> Result<Vec<SkillInfo>> {
    skill_service::get_skills(&pool)
}

#[tauri::command]
pub fn sync_skills_from_clawhub(pool: State<'_, DbPool>) -> Result<Vec<SkillInfo>> {
    skill_service::sync_skills_from_clawhub(&pool)
}
