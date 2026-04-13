use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use tauri::State;

// ── License Keys ─────────────────────────────────────────────
// Hardcoded valid license keys. Replace with API validation later.
const VALID_LICENSE_KEYS: &[&str] = &[
    "CLAW-PILOT-2026-ALPHA-001",
    "CLAW-PILOT-2026-ALPHA-002",
    "CLAW-PILOT-2026-ALPHA-003",
    "CLAW-PILOT-2026-BETA-001",
    "CLAW-PILOT-2026-BETA-002",
    "CLAW-PILOT-2026-BETA-003",
];

fn is_valid_key(key: &str) -> bool {
    let normalized = key.trim().to_uppercase();
    VALID_LICENSE_KEYS.iter().any(|k| *k == normalized)
}

// ── License Commands ─────────────────────────────────────────

#[tauri::command]
pub fn activate_license(pool: State<'_, DbPool>, license_key: String) -> Result<bool> {
    let key = license_key.trim().to_uppercase();
    if !is_valid_key(&key) {
        return Err(AppError::Validation("无效的许可证密钥".to_string()));
    }

    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('license_key', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key],
    )?;
    Ok(true)
}

#[tauri::command]
pub fn deactivate_license(pool: State<'_, DbPool>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM settings WHERE key = 'license_key'", [])?;
    Ok(())
}

#[tauri::command]
pub fn get_license_status(pool: State<'_, DbPool>) -> Result<LicenseStatus> {
    let conn = pool.get()?;
    let stored_key = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'license_key'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok();

    match stored_key {
        Some(key) if is_valid_key(&key) => Ok(LicenseStatus {
            activated: true,
            license_key: Some(mask_key(&key)),
        }),
        Some(_) => {
            // Stored key is no longer valid (removed from list)
            Ok(LicenseStatus { activated: false, license_key: None })
        }
        None => Ok(LicenseStatus { activated: false, license_key: None }),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LicenseStatus {
    pub activated: bool,
    pub license_key: Option<String>,
}

/// Mask license key for display: "CLAW-PILOT-2026-ALPHA-001" -> "CLAW-****-****-****-001"
fn mask_key(key: &str) -> String {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() >= 3 {
        let first = parts[0];
        let last = parts[parts.len() - 1];
        let masked_middle: Vec<&str> = parts[1..parts.len() - 1].iter().map(|_| "****").collect();
        format!("{}-{}-{}", first, masked_middle.join("-"), last)
    } else {
        format!("{}****", &key[..key.len().min(4)])
    }
}

// ── Settings Commands ────────────────────────────────────────

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
