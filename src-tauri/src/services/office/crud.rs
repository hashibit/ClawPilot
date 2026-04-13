use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::{Office, OfficeDeployment};

pub fn row_to_office(row: &rusqlite::Row<'_>) -> rusqlite::Result<Office> {
    Ok(Office {
        id: row.get(0)?,
        name: row.get(1)?,
        address: row.get(2)?,
        access_card: row.get(3)?,
        phone: row.get(4)?,
        receptionist_image: row.get(5)?,
        ownership: row
            .get::<_, Option<String>>(6)?
            .unwrap_or_else(|| "RENTED".into()),
        monthly_rent: row.get(7)?,
        internet_speed: row.get(8)?,
        decoration_grade: row
            .get::<_, Option<String>>(9)?
            .unwrap_or_else(|| "MEDIUM".into()),
        description: row.get(10)?,
        access_auth_type: row.get(11)?,
        access_user: row.get(12)?,
        access_password: row.get(13)?,
        ssh_key_path: row.get(14)?,
        daemon_url: row.get(15)?,
        opc_root: row.get(16)?,
        initial_openclaw_config: row.get(17)?,
        openclaw_version: row.get(18).ok().flatten(),
        openclaw_install_path: row.get(19).ok().flatten(),
        openclaw_download_url: row.get(20).ok().flatten(),
        openclaw_nodejs_path: row.get(21).ok().flatten(),
        openclaw_nodejs_version: row.get(22).ok().flatten(),
        openclaw_installed_at: row.get(23).ok().flatten(),
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
        current_opc_id: row.get(26).ok().flatten(),
        current_opc_name: row.get(27).ok().flatten(),
    })
}

pub fn now() -> i64 {
    Utc::now().timestamp()
}

const OFFICE_SELECT: &str = "SELECT o.id, o.name, o.address, o.access_card, o.phone, o.receptionist_image,
        o.ownership, o.monthly_rent, o.internet_speed, o.decoration_grade,
        o.description, o.access_auth_type, o.access_user, o.access_password, o.ssh_key_path,
        o.daemon_url, o.opc_root, o.initial_openclaw_config,
        o.openclaw_version, o.openclaw_install_path, o.openclaw_download_url, o.openclaw_nodejs_path, o.openclaw_nodejs_version, o.openclaw_installed_at,
        o.created_at, o.updated_at,
        oc.id, oc.display_name
 FROM offices o
 LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1";

pub fn get_offices(pool: &DbPool) -> Result<Vec<Office>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        &format!("{} ORDER BY o.created_at", OFFICE_SELECT),
    )?;
    let rows = stmt
        .query_map([], row_to_office)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_office(pool: &DbPool, id: &str) -> Result<Office> {
    let conn = pool.get()?;
    conn.query_row(
        &format!("{} WHERE o.id = ?1", OFFICE_SELECT),
        rusqlite::params![id],
        row_to_office,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn create_office(pool: &DbPool, office: &Office) -> Result<String> {
    let conn = pool.get()?;
    let ts = now();
    // Generate UUID if not provided
    let id = if office.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        office.id.clone()
    };
    conn.execute(
        "INSERT INTO offices
             (id, name, address, access_card, phone, receptionist_image,
              ownership, monthly_rent, internet_speed, decoration_grade,
              description, access_auth_type, access_user, access_password, ssh_key_path,
              daemon_url, opc_root, initial_openclaw_config,
              openclaw_version, openclaw_install_path, openclaw_download_url,
              openclaw_nodejs_path, openclaw_nodejs_version, openclaw_installed_at,
              created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)",
        rusqlite::params![
            id,
            office.name,
            office.address,
            office.access_card,
            office.phone,
            office.receptionist_image,
            office.ownership,
            office.monthly_rent,
            office.internet_speed,
            office.decoration_grade,
            office.description,
            office.access_auth_type,
            office.access_user,
            office.access_password,
            office.ssh_key_path.as_ref().map(|s| s.trim().to_string()),
            office.daemon_url,
            office.opc_root,
            office.initial_openclaw_config,
            office.openclaw_version,
            office.openclaw_install_path,
            office.openclaw_download_url,
            office.openclaw_nodejs_path,
            office.openclaw_nodejs_version,
            office.openclaw_installed_at,
            office.created_at.max(1).min(i64::MAX - 1) + 0 * ts,
            office.updated_at,
        ],
    )?;
    Ok(id)
}

pub fn update_office(pool: &DbPool, id: &str, office: &Office) -> Result<()> {
    let conn = pool.get()?;
    let affected = conn.execute(
        "UPDATE offices SET
             name=?2, address=?3, access_card=?4, phone=?5, receptionist_image=?6,
             ownership=?7, monthly_rent=?8, internet_speed=?9, decoration_grade=?10,
             description=?11, access_auth_type=?12, access_user=?13,
             access_password=?14, ssh_key_path=?15,
             daemon_url=?16, opc_root=?17, initial_openclaw_config=?18,
             openclaw_version=?19, openclaw_install_path=?20, openclaw_download_url=?21,
             openclaw_nodejs_path=?22, openclaw_nodejs_version=?23, openclaw_installed_at=?24,
             updated_at=?25
         WHERE id=?1",
        rusqlite::params![
            id,
            office.name,
            office.address,
            office.access_card,
            office.phone,
            office.receptionist_image,
            office.ownership,
            office.monthly_rent,
            office.internet_speed,
            office.decoration_grade,
            office.description,
            office.access_auth_type,
            office.access_user,
            office.access_password,
            office.ssh_key_path.as_ref().map(|s| s.trim().to_string()),
            office.daemon_url,
            office.opc_root,
            office.initial_openclaw_config,
            office.openclaw_version,
            office.openclaw_install_path,
            office.openclaw_download_url,
            office.openclaw_nodejs_path,
            office.openclaw_nodejs_version,
            office.openclaw_installed_at,
            now(),
        ],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok(())
}

pub fn delete_office(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE opc_config SET office_id = NULL WHERE office_id = ?1",
        rusqlite::params![id],
    )?;
    conn.execute("DELETE FROM offices WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

pub fn assign_office(pool: &DbPool, opc_id: &str, office_id: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE opc_config SET office_id = ?2 WHERE id = ?1",
        rusqlite::params![opc_id, office_id],
    )?;
    Ok(())
}

pub fn get_opc_office(pool: &DbPool, opc_id: &str) -> Result<Option<Office>> {
    let conn = pool.get()?;
    let office_id: Option<String> = conn
        .query_row(
            "SELECT office_id FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| r.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(opc_id.to_string()),
            other => AppError::Database(other),
        })?;

    // Drop the connection lock before calling get_office to avoid deadlock
    drop(conn);

    match office_id {
        None => Ok(None),
        Some(oid) => get_office(pool, &oid).map(Some),
    }
}

/// Update office daemon URL
pub fn update_office_daemon_url(
    pool: &DbPool,
    office_id: &str,
    daemon_url: &str,
) -> Result<()> {
    let conn = pool.get()?;
    let ts = now();

    // Read existing initial_openclaw_config; if not set, use empty default
    let existing_config: Option<String> = conn
        .query_row(
            "SELECT initial_openclaw_config FROM offices WHERE id = ?1",
            rusqlite::params![office_id],
            |r| r.get(0),
        )
        .unwrap_or(None);

    let initial_config = existing_config.unwrap_or_else(|| {
        r#"{"agents":{"defaults":{},"list":[]},"channels":{},"models":{"providers":{}}}"#
            .to_string()
    });

    conn.execute(
        "UPDATE offices SET daemon_url = ?2, initial_openclaw_config = ?3, updated_at = ?4 WHERE id = ?1",
        rusqlite::params![office_id, daemon_url, initial_config, ts],
    )?;

    Ok(())
}

/// Update office daemon configuration by office ID (public wrapper)
pub fn update_office_daemon_config_by_id(
    pool: &DbPool,
    office_id: &str,
    daemon_url: &str,
) -> Result<()> {
    update_office_daemon_url(pool, office_id, daemon_url)
}

/// Update openclaw installation info after a successful install
pub fn update_office_openclaw_info(
    pool: &DbPool,
    office_id: &str,
    version: &str,
    install_path: &str,
    nodejs_path: &str,
    download_url: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
    let ts = now();
    conn.execute(
        "UPDATE offices SET openclaw_version=?2, openclaw_install_path=?3, \
         openclaw_nodejs_path=?4, openclaw_download_url=?5, openclaw_installed_at=?6, \
         updated_at=?6 WHERE id=?1",
        rusqlite::params![office_id, version, install_path, nodejs_path, download_url, ts],
    )?;
    Ok(())
}

/// Get the version of local clawpilot-daemon binary
pub async fn get_local_daemon_version() -> Result<Option<String>> {
    use std::process::Command;

    // Try to find daemon binary
    let daemon_paths = [
        "clawpilot-daemon",
        "~/bin/clawpilot-daemon",
        "/usr/local/bin/clawpilot-daemon",
    ];

    for path in &daemon_paths {
        let expanded = if path.starts_with("~/") {
            if let Some(home) = dirs::home_dir() {
                home.join(&path[2..]).to_string_lossy().to_string()
            } else {
                continue;
            }
        } else {
            path.to_string()
        };

        let output = Command::new(&expanded).arg("--version").output();

        if let Ok(out) = output {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                return Ok(Some(version));
            }
        }
    }

    Ok(None)
}

/// Get the name of the current running OPC
pub fn get_current_opc_name(pool: &DbPool) -> Result<String> {
    let conn = pool.get()?;
    let name: String = conn
        .query_row(
            "SELECT display_name FROM opc_config WHERE is_running = 1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("No running OPC found".to_string())
            }
            other => AppError::Database(other),
        })?;
    Ok(name)
}

pub fn get_office_deployments(
    pool: &DbPool,
    office_id: &str,
    limit: i64,
) -> Result<Vec<OfficeDeployment>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, opc_id, opc_name, office_id, office_name, deployed_at, undeployed_at, is_active
         FROM office_deployments
         WHERE office_id = ?1
         ORDER BY deployed_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![office_id, limit], |row| {
            Ok(OfficeDeployment {
                id: row.get(0)?,
                opc_id: row.get(1)?,
                opc_name: row.get(2)?,
                office_id: row.get(3)?,
                office_name: row.get(4)?,
                deployed_at: row.get(5)?,
                undeployed_at: row.get(6)?,
                is_active: row.get::<_, i64>(7)? != 0,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}
