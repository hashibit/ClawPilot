use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Success,
    Failed,
    Rolledback,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::Running => write!(f, "running"),
            TaskStatus::Success => write!(f, "success"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Rolledback => write!(f, "rolledback"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskRecord {
    pub task_id: String,
    pub opc_id: String,
    pub status: TaskStatus,
    pub progress: u8,
    pub current_step: String,
    pub logs: Vec<String>,
    pub error: Option<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub backup_path: Option<String>,
}

impl TaskRecord {
    pub fn new(task_id: String, opc_id: String) -> Self {
        Self {
            task_id,
            opc_id,
            status: TaskStatus::Pending,
            progress: 0,
            current_step: "初始化".to_string(),
            logs: Vec::new(),
            error: None,
            started_at: Utc::now(),
            completed_at: None,
            backup_path: None,
        }
    }

    pub fn log(&mut self, msg: impl Into<String>) {
        let entry = format!("[{}] {}", Utc::now().format("%H:%M:%S"), msg.into());
        tracing::info!("{}", entry);
        self.logs.push(entry);
    }
}

#[derive(Clone)]
pub struct AppState {
    pub api_key: String,
    pub tasks: Arc<DashMap<String, TaskRecord>>,
}

impl AppState {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            tasks: Arc::new(DashMap::new()),
        }
    }
}
