use chrono::Utc;
use uuid::Uuid;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DeploymentStatus {
    Pending,
    Running,
    Success,
    Failed,
    Rollback,
}

impl DeploymentStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Running => "RUNNING",
            Self::Success => "SUCCESS",
            Self::Failed => "FAILED",
            Self::Rollback => "ROLLBACK",
        }
    }
    fn from_str(s: &str) -> Self {
        match s {
            "RUNNING" => Self::Running,
            "SUCCESS" => Self::Success,
            "FAILED" => Self::Failed,
            "ROLLBACK" => Self::Rollback,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentTask {
    pub id: String,
    pub opc_name: String,
    pub status: DeploymentStatus,
    pub message: Option<String>,
    /// JSON array of step descriptions
    pub steps: String,
    pub current_step: i64,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeploymentTask> {
    Ok(DeploymentTask {
        id: row.get(0)?,
        opc_name: row.get(1)?,
        status: DeploymentStatus::from_str(&row.get::<_, String>(2)?),
        message: row.get(3)?,
        steps: row.get(4)?,
        current_step: row.get(5)?,
        created_at: row.get(6)?,
        started_at: row.get(7)?,
        completed_at: row.get(8)?,
    })
}

pub fn start_deployment(pool: &DbPool, opc_name: &str) -> Result<String> {
    let conn = pool.get()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let default_steps = r#"["生成配置文件","停止旧进程","部署新配置","启动服务","验证健康状态"]"#;

    conn.execute(
        "INSERT INTO deployment_tasks
             (id, opc_name, status, steps, current_step, created_at, started_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        rusqlite::params![id, opc_name, DeploymentStatus::Running.as_str(), default_steps, now],
    )?;
    Ok(id)
}

pub fn get_deployment(pool: &DbPool, id: &str) -> Result<DeploymentTask> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT id, opc_name, status, message, steps, current_step,
                created_at, started_at, completed_at
         FROM deployment_tasks WHERE id = ?1",
        rusqlite::params![id],
        row_to_task,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(id.to_string()),
        other => AppError::Database(other),
    })
}

pub fn update_deployment_status(
    pool: &DbPool,
    id: &str,
    status: DeploymentStatus,
    message: Option<&str>,
    current_step: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let now = Utc::now().timestamp();

    let completed_at: Option<i64> = match status {
        DeploymentStatus::Success | DeploymentStatus::Failed | DeploymentStatus::Rollback => {
            Some(now)
        }
        _ => None,
    };

    let affected = conn.execute(
        "UPDATE deployment_tasks
         SET status = ?2, message = ?3, current_step = ?4, completed_at = ?5
         WHERE id = ?1",
        rusqlite::params![id, status.as_str(), message, current_step, completed_at],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok(())
}

pub fn cancel_deployment(pool: &DbPool, id: &str) -> Result<()> {
    update_deployment_status(pool, id, DeploymentStatus::Failed, Some("已取消"), 0)
}

pub fn get_recent_deployments(pool: &DbPool, opc_name: &str, limit: i64) -> Result<Vec<DeploymentTask>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, opc_name, status, message, steps, current_step,
                created_at, started_at, completed_at
         FROM deployment_tasks
         WHERE opc_name = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![opc_name, limit], row_to_task)?
        .collect::<std::result::Result<_, _>>()?;
    Ok(rows)
}

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

    #[test]
    fn test_start_and_get_deployment() {
        let pool = setup();
        let id = start_deployment(&pool, "my_opc").unwrap();
        let task = get_deployment(&pool, &id).unwrap();
        assert_eq!(task.opc_name, "my_opc");
        assert_eq!(task.status, DeploymentStatus::Running);
        assert!(task.started_at.is_some());
    }

    #[test]
    fn test_update_status_to_success() {
        let pool = setup();
        let id = start_deployment(&pool, "opc").unwrap();
        update_deployment_status(&pool, &id, DeploymentStatus::Success, None, 5).unwrap();
        let task = get_deployment(&pool, &id).unwrap();
        assert_eq!(task.status, DeploymentStatus::Success);
        assert_eq!(task.current_step, 5);
        assert!(task.completed_at.is_some());
    }

    #[test]
    fn test_cancel_deployment() {
        let pool = setup();
        let id = start_deployment(&pool, "opc").unwrap();
        cancel_deployment(&pool, &id).unwrap();
        let task = get_deployment(&pool, &id).unwrap();
        assert_eq!(task.status, DeploymentStatus::Failed);
        assert_eq!(task.message.as_deref(), Some("已取消"));
    }

    #[test]
    fn test_get_nonexistent_returns_not_found() {
        let pool = setup();
        assert!(matches!(
            get_deployment(&pool, "ghost"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn test_get_recent_deployments() {
        let pool = setup();
        start_deployment(&pool, "opc").unwrap();
        start_deployment(&pool, "opc").unwrap();
        start_deployment(&pool, "other").unwrap();
        let tasks = get_recent_deployments(&pool, "opc", 10).unwrap();
        assert_eq!(tasks.len(), 2);
    }
}
