use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize, Serializer};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::scheduler::{Db, DagScheduler, Worker};

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

/// Internal state of a task, protected by Mutex for thread-safe updates
#[derive(Debug, Clone, Serialize)]
pub struct TaskState {
    pub status: TaskStatus,
    pub progress: u8,
    pub current_step: String,
    pub logs: Vec<String>,
    pub error: Option<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub backup_path: Option<String>,
}

impl TaskState {
    pub fn new() -> Self {
        Self {
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

#[derive(Debug, Clone)]
pub struct TaskRecord {
    pub task_id: String,
    pub opc_id: String,
    pub inner: Arc<Mutex<TaskState>>,
}

impl Serialize for TaskRecord {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeMap;
        let state = self.inner.blocking_lock();
        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("task_id", &self.task_id)?;
        map.serialize_entry("opc_id", &self.opc_id)?;
        map.serialize_entry("state", &*state)?;
        map.end()
    }
}

impl TaskRecord {
    pub fn new(task_id: String, opc_id: String) -> Self {
        Self {
            task_id,
            opc_id,
            inner: Arc::new(Mutex::new(TaskState::new())),
        }
    }

    /// Update task state atomically (async)
    pub async fn update<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut TaskState) -> R,
    {
        let mut state = self.inner.lock().await;
        f(&mut state)
    }

    /// Update task state atomically (sync, for use in spawn_blocking or non-async contexts)
    pub fn update_blocking<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut TaskState) -> R,
    {
        let mut state = self.inner.blocking_lock();
        f(&mut state)
    }

    /// Get a clone of the current state (for reading)
    pub async fn get_state(&self) -> TaskState {
        self.inner.lock().await.clone()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub api_key: String,
    pub tasks: Arc<DashMap<String, TaskRecord>>,
    pub scheduler_db: Option<Db>,
    pub scheduler_worker: Option<Worker>,
    pub scheduler_dag: Option<DagScheduler>,
}

impl AppState {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            tasks: Arc::new(DashMap::new()),
            scheduler_db: None,
            scheduler_worker: None,
            scheduler_dag: None,
        }
    }

    pub fn with_scheduler(
        mut self,
        db: Db,
        worker: Worker,
        dag: DagScheduler,
    ) -> Self {
        self.scheduler_db = Some(db);
        self.scheduler_worker = Some(worker);
        self.scheduler_dag = Some(dag);
        self
    }
}
