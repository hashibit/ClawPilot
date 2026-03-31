use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::tool::ToolInfo;
use uuid::Uuid;

/// Local tool input for create_tool command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LocalToolInput {
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

pub fn get_tools(pool: &DbPool) -> Result<Vec<ToolInfo>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, slug, description, author, size, url, version,
                tags, category, downloads, is_builtin, last_synced
         FROM tools ORDER BY name",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ToolInfo {
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

/// Stub: syncs tools from clawhub.ai (HTTP not implemented yet)
pub fn sync_tools_from_clawhub(_pool: &DbPool) -> Result<Vec<ToolInfo>> {
    Ok(vec![])
}

/// Create a new local tool
pub fn create_tool(pool: &DbPool, tool: LocalToolInput) -> Result<i64> {
    let conn = pool.get()?;

    // Validate inputs
    if tool.name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if tool.display_name.trim().is_empty() {
        return Err(AppError::Validation("display_name is required".into()));
    }

    // Generate unique id and slug
    let id = Uuid::new_v4().to_string();
    let slug = tool.name.trim().to_lowercase().replace(' ', "-");

    // Check for duplicate name or slug
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tools WHERE name = ?1 OR slug = ?2)",
            rusqlite::params![tool.name.trim(), &slug],
            |row| row.get(0),
        )?;

    if exists {
        return Err(AppError::Validation("工具名称已存在".into()));
    }

    let ts = chrono::Utc::now().timestamp();

    conn.execute(
        r#"INSERT INTO tools (id, name, slug, description, category, updated_at, is_builtin, last_synced)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)"#,
        rusqlite::params![
            id,
            tool.name.trim(),
            slug,
            tool.description.as_ref().map(|s| s.trim()).unwrap_or(""),
            tool.category.as_ref().map(|s| s.trim()).unwrap_or("general"),
            ts,
            ts,
        ],
    )?;

    // Return the row id (for compatibility with server which returns lastInsertRowid)
    // Since we're using TEXT id, we return a dummy value
    Ok(0)
}

/// Delete a local tool by id
pub fn delete_tool(pool: &DbPool, id: String) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM tools WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}
