use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize, Serializer};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

use crate::scheduler::{Db, DagScheduler, Worker, ActivityEvent};

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
        let state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
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

    /// Update task state atomically
    pub fn update<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut TaskState) -> R,
    {
        let mut state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut state)
    }

    /// Get a clone of the current state (for reading)
    pub fn get_state(&self) -> TaskState {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub tasks: Arc<DashMap<String, TaskRecord>>,
    pub scheduler_db: Option<Db>,
    pub scheduler_worker: Option<Worker>,
    pub scheduler_dag: Option<DagScheduler>,
    /// Broadcast sender for activity events (daemon -> server)
    pub activity_tx: Option<broadcast::Sender<ActivityEvent>>,
    /// Bearer token used to validate `?token=` query parameter on
    /// /ws/activities (the WS handler is exempt from the HTTP middleware
    /// because browser WebSocket can't send Authorization headers).
    pub bearer_token: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(DashMap::new()),
            scheduler_db: None,
            scheduler_worker: None,
            scheduler_dag: None,
            activity_tx: None,
            bearer_token: None,
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

    pub fn with_activity_sender(mut self, tx: broadcast::Sender<ActivityEvent>) -> Self {
        self.activity_tx = Some(tx);
        self
    }

    pub fn with_bearer_token(mut self, token: String) -> Self {
        self.bearer_token = Some(token);
        self
    }
}
