use crate::database::pool::DbPool;
use crate::error::Result;
use tauri::State;

#[tauri::command]
pub fn get_opc_root(pool: State<'_, DbPool>) -> Result<String> {
    let conn = pool.get()?;
    let row = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'opc_root'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok();
    Ok(row.unwrap_or_else(|| "~/.openclaw/OPC".to_string()))
}

#[tauri::command]
pub fn set_opc_root(pool: State<'_, DbPool>, opc_root: String) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('opc_root', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![opc_root],
    )?;
    Ok(())
}
