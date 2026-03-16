use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::skill::SkillInfo;

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
