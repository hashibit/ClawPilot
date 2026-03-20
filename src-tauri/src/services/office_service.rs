use chrono::Utc;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};

// ── helpers ──────────────────────────────────────────────────

fn row_to_office(row: &rusqlite::Row<'_>) -> rusqlite::Result<Office> {
    Ok(Office {
        id: row.get(0)?,
        name: row.get(1)?,
        address: row.get(2)?,
        access_card: row.get(3)?,
        phone: row.get(4)?,
        receptionist_image: row.get(5)?,
        ownership: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "RENTED".into()),
        monthly_rent: row.get(7)?,
        internet_speed: row.get(8)?,
        decoration_grade: row.get::<_, Option<String>>(9)?.unwrap_or_else(|| "MEDIUM".into()),
        description: row.get(10)?,
        daemon_url: row.get(11)?,
        daemon_api_key: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        current_opc_id: row.get(15).ok().flatten(),
        current_opc_name: row.get(16).ok().flatten(),
    })
}

fn now() -> i64 {
    Utc::now().timestamp()
}

// ── queries ──────────────────────────────────────────────────

pub fn get_offices(pool: &DbPool) -> Result<Vec<Office>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT o.id, o.name, o.address, o.access_card, o.phone, o.receptionist_image,
                o.ownership, o.monthly_rent, o.internet_speed, o.decoration_grade,
                o.description, o.daemon_url, o.daemon_api_key, o.created_at, o.updated_at,
                oc.id, oc.display_name
         FROM offices o
         LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
         ORDER BY o.created_at",
    )?;
    let rows = stmt
        .query_map([], row_to_office)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_office(pool: &DbPool, id: &str) -> Result<Office> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT o.id, o.name, o.address, o.access_card, o.phone, o.receptionist_image,
                o.ownership, o.monthly_rent, o.internet_speed, o.decoration_grade,
                o.description, o.daemon_url, o.daemon_api_key, o.created_at, o.updated_at,
                oc.id, oc.display_name
         FROM offices o
         LEFT JOIN opc_config oc ON oc.office_id = o.id AND oc.is_running = 1
         WHERE o.id = ?1",
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
    conn.execute(
        "INSERT INTO offices
             (id, name, address, access_card, phone, receptionist_image,
              ownership, monthly_rent, internet_speed, decoration_grade,
              description, daemon_url, daemon_api_key, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        rusqlite::params![
            office.id,
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
            office.daemon_url,
            office.daemon_api_key,
            office.created_at.max(1).min(i64::MAX - 1) + 0 * ts, // use provided or fallback
            office.updated_at,
        ],
    )?;
    Ok(office.id.clone())
}

pub fn update_office(pool: &DbPool, id: &str, office: &Office) -> Result<()> {
    let conn = pool.get()?;
    let affected = conn.execute(
        "UPDATE offices SET
             name=?2, address=?3, access_card=?4, phone=?5, receptionist_image=?6,
             ownership=?7, monthly_rent=?8, internet_speed=?9, decoration_grade=?10,
             description=?11, daemon_url=?12, daemon_api_key=?13, updated_at=?14
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
            office.daemon_url,
            office.daemon_api_key,
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

    match office_id {
        None => Ok(None),
        Some(oid) => get_office(pool, &oid).map(Some),
    }
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

pub async fn check_daemon_health(daemon_url: &str, api_key: &str) -> DaemonHealthResult {
    if daemon_url.is_empty() {
        return DaemonHealthResult {
            ok: false,
            error: Some("未配置 Daemon URL".into()),
            ..Default::default()
        };
    }

    let url = format!("{}/health", daemon_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DaemonHealthResult {
                ok: false,
                error: Some(e.to_string()),
                ..Default::default()
            }
        }
    };

    match client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => DaemonHealthResult {
                    ok: true,
                    status: json["status"].as_str().map(String::from),
                    version: json["version"].as_str().map(String::from),
                    openclaw_status: json["openclaw_status"].as_str().map(String::from),
                    openclaw_pid: json["openclaw_pid"].as_u64().map(|v| v as u32),
                    active_tasks: json["active_tasks"].as_u64(),
                    error: None,
                },
                Err(e) => DaemonHealthResult {
                    ok: false,
                    error: Some(e.to_string()),
                    ..Default::default()
                },
            }
        }
        Ok(resp) => DaemonHealthResult {
            ok: false,
            error: Some(format!("HTTP {}", resp.status())),
            ..Default::default()
        },
        Err(e) => DaemonHealthResult {
            ok: false,
            error: Some(e.to_string()),
            ..Default::default()
        },
    }
}
