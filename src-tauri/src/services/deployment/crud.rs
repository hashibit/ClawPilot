use uuid::Uuid;

use crate::database::helpers;
use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::office::OfficeDeployment;

use super::types::{now, row_to_task, DeploymentStatus, DeploymentTask};

pub fn start_deployment(pool: &DbPool, opc_id: &str, office_id: &str) -> Result<String> {
    // Look up names before acquiring conn to avoid holding the lock across calls
    let opc_name = helpers::get_opc_name(pool, opc_id)?;
    let office_name = helpers::get_office_name(pool, office_id)?;

    let id = Uuid::new_v4().to_string();
    let ts = now();
    let steps = r#"["准备配置文件","发送部署包","等待完成","健康检查"]"#;

    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO deployment_tasks
             (id, opc_id, office_id, opc_name, status, steps, current_step, created_at, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)",
        rusqlite::params![
            id,
            opc_id,
            office_id,
            opc_name,
            DeploymentStatus::Pending.as_str(),
            steps,
            ts
        ],
    )?;

    // Simulate stub deployment (no daemon configured)
    // In production Tauri we'll call the real daemon
    let pool2 = pool.clone();
    let task_id = id.clone();
    let opc_id2 = opc_id.to_string();
    let opc_name2 = opc_name.clone();
    let office_id2 = office_id.to_string();
    let office_name2 = office_name.clone();

    std::thread::spawn(move || {
        run_stub_deploy(
            &pool2,
            &task_id,
            &opc_id2,
            &opc_name2,
            &office_id2,
            &office_name2,
        );
    });

    Ok(id)
}

fn set_step(pool: &DbPool, id: &str, step: i64, status: &str, extra_msg: Option<&str>) {
    if let Ok(conn) = pool.get() {
        let ts = now();
        let _ = conn.execute(
            "UPDATE deployment_tasks SET status=?2, current_step=?3, message=?4, updated_at=?5 WHERE id=?1",
            rusqlite::params![id, status, step, extra_msg, ts],
        );
    }
}

fn run_stub_deploy(
    pool: &DbPool,
    task_id: &str,
    opc_id: &str,
    opc_name: &str,
    office_id: &str,
    office_name: &str,
) {
    std::thread::sleep(std::time::Duration::from_millis(300));
    set_step(pool, task_id, 1, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(500));
    set_step(pool, task_id, 2, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(400));
    set_step(pool, task_id, 3, "RUNNING", None);
    std::thread::sleep(std::time::Duration::from_millis(800));

    let ts = now();
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "UPDATE deployment_tasks SET status='SUCCESS', current_step=4,
             message='(仿真模式：未配置 Daemon)', completed_at=?2, updated_at=?2 WHERE id=?1",
            rusqlite::params![task_id, ts],
        );
        // Record active deployment
        let _ = conn.execute(
            "UPDATE office_deployments SET is_active=0, undeployed_at=?1 WHERE opc_id=?2 AND is_active=1",
            rusqlite::params![ts, opc_id],
        );
        let dep_id = Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO office_deployments (id, opc_id, opc_name, office_id, office_name, deployed_at, is_active)
             VALUES (?1,?2,?3,?4,?5,?6,1)",
            rusqlite::params![dep_id, opc_id, opc_name, office_id, office_name, ts],
        );
        let _ = conn.execute(
            "UPDATE opc_config SET is_running=1, office_id=?2 WHERE id=?1",
            rusqlite::params![opc_id, office_id],
        );
    }
}

pub fn get_deployment(pool: &DbPool, id: &str) -> Result<DeploymentTask> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT dt.id, dt.opc_name, dt.status, dt.message, dt.steps, dt.current_step,
                dt.created_at, dt.started_at, dt.completed_at,
                dt.opc_id, dt.office_id, o.name
         FROM deployment_tasks dt
         LEFT JOIN offices o ON o.id = dt.office_id
         WHERE dt.id = ?1",
        rusqlite::params![id],
        row_to_task,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn cancel_deployment(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let ts = now();
    conn.execute(
        "UPDATE deployment_tasks SET status='FAILED', message='已取消', completed_at=?2 WHERE id=?1",
        rusqlite::params![id, ts],
    )?;
    Ok(())
}

pub fn get_recent_deployments(
    pool: &DbPool,
    opc_id: &str,
    limit: i64,
) -> Result<Vec<DeploymentTask>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT dt.id, dt.opc_name, dt.status, dt.message, dt.steps, dt.current_step,
                dt.created_at, dt.started_at, dt.completed_at,
                dt.opc_id, dt.office_id, o.name
         FROM deployment_tasks dt
         LEFT JOIN offices o ON o.id = dt.office_id
         WHERE dt.opc_id = ?1
         ORDER BY dt.created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![opc_id, limit], row_to_task)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

pub fn get_office_deployments(
    pool: &DbPool,
    office_id: &str,
    limit: i64,
) -> Result<Vec<OfficeDeployment>> {
    crate::services::office::get_office_deployments(pool, office_id, limit)
}
