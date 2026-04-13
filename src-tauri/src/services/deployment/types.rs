/// Deployment status enum
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
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Running => "RUNNING",
            Self::Success => "SUCCESS",
            Self::Failed => "FAILED",
            Self::Rollback => "ROLLBACK",
        }
    }

    pub fn from_str(s: &str) -> Self {
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
    pub opc_id: Option<String>,
    pub opc_name: String,
    pub office_id: Option<String>,
    pub office_name: Option<String>,
    pub status: DeploymentStatus,
    pub message: Option<String>,
    /// JSON array of step descriptions
    pub steps: String,
    pub current_step: i64,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

pub fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeploymentTask> {
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
        opc_id: row.get(9).ok().flatten(),
        office_id: row.get(10).ok().flatten(),
        office_name: row.get(11).ok().flatten(),
    })
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
