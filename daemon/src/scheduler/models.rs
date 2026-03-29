//! Data models for the multi-agent scheduler
//!
//! These structs mirror the proto definitions in proto/multi-agent.proto

use chrono::Utc;
use serde::{Deserialize, Serialize};

// =============================================================================
// Enums
// =============================================================================

/// Plan status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    #[serde(alias = "pending_approval")]
    PendingApproval,
    Approved,
    Executing,
    Completed,
    Blocked,
    Cancelled,
    Superseded,
}

impl std::fmt::Display for PlanStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlanStatus::PendingApproval => write!(f, "pending_approval"),
            PlanStatus::Approved => write!(f, "approved"),
            PlanStatus::Executing => write!(f, "executing"),
            PlanStatus::Completed => write!(f, "completed"),
            PlanStatus::Blocked => write!(f, "blocked"),
            PlanStatus::Cancelled => write!(f, "cancelled"),
            PlanStatus::Superseded => write!(f, "superseded"),
        }
    }
}

impl From<PlanStatus> for &'static str {
    fn from(status: PlanStatus) -> Self {
        match status {
            PlanStatus::PendingApproval => "pending_approval",
            PlanStatus::Approved => "approved",
            PlanStatus::Executing => "executing",
            PlanStatus::Completed => "completed",
            PlanStatus::Blocked => "blocked",
            PlanStatus::Cancelled => "cancelled",
            PlanStatus::Superseded => "superseded",
        }
    }
}

impl TryFrom<&str> for PlanStatus {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "pending_approval" => Ok(PlanStatus::PendingApproval),
            "approved" => Ok(PlanStatus::Approved),
            "executing" => Ok(PlanStatus::Executing),
            "completed" => Ok(PlanStatus::Completed),
            "blocked" => Ok(PlanStatus::Blocked),
            "cancelled" => Ok(PlanStatus::Cancelled),
            "superseded" => Ok(PlanStatus::Superseded),
            _ => Err(format!("Unknown plan status: {}", s)),
        }
    }
}

/// Task status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Blocked,
    Cancelled,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Blocked => write!(f, "blocked"),
            TaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl From<TaskStatus> for &'static str {
    fn from(status: TaskStatus) -> Self {
        match status {
            TaskStatus::Pending => "pending",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed => "failed",
            TaskStatus::Blocked => "blocked",
            TaskStatus::Cancelled => "cancelled",
        }
    }
}

impl TryFrom<&str> for TaskStatus {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "pending" => Ok(TaskStatus::Pending),
            "in_progress" => Ok(TaskStatus::InProgress),
            "completed" => Ok(TaskStatus::Completed),
            "failed" => Ok(TaskStatus::Failed),
            "blocked" => Ok(TaskStatus::Blocked),
            "cancelled" => Ok(TaskStatus::Cancelled),
            _ => Err(format!("Unknown task status: {}", s)),
        }
    }
}

/// Artifact status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactStatus {
    Valid,
    Invalidated,
}

impl std::fmt::Display for ArtifactStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArtifactStatus::Valid => write!(f, "valid"),
            ArtifactStatus::Invalidated => write!(f, "invalidated"),
        }
    }
}

impl From<ArtifactStatus> for &'static str {
    fn from(status: ArtifactStatus) -> Self {
        match status {
            ArtifactStatus::Valid => "valid",
            ArtifactStatus::Invalidated => "invalidated",
        }
    }
}

impl TryFrom<&str> for ArtifactStatus {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "valid" => Ok(ArtifactStatus::Valid),
            "invalidated" => Ok(ArtifactStatus::Invalidated),
            _ => Err(format!("Unknown artifact status: {}", s)),
        }
    }
}

/// Inbox message type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InboxMessageType {
    TaskStarted,
    TaskDone,
    TaskFailed,
    TaskCancelled,
    TaskProgress,
}

impl std::fmt::Display for InboxMessageType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InboxMessageType::TaskStarted => write!(f, "task_started"),
            InboxMessageType::TaskDone => write!(f, "task_done"),
            InboxMessageType::TaskFailed => write!(f, "task_failed"),
            InboxMessageType::TaskCancelled => write!(f, "task_cancelled"),
            InboxMessageType::TaskProgress => write!(f, "task_progress"),
        }
    }
}

impl From<InboxMessageType> for &'static str {
    fn from(msg_type: InboxMessageType) -> Self {
        match msg_type {
            InboxMessageType::TaskStarted => "task_started",
            InboxMessageType::TaskDone => "task_done",
            InboxMessageType::TaskFailed => "task_failed",
            InboxMessageType::TaskCancelled => "task_cancelled",
            InboxMessageType::TaskProgress => "task_progress",
        }
    }
}

impl TryFrom<&str> for InboxMessageType {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "task_started" => Ok(InboxMessageType::TaskStarted),
            "task_done" => Ok(InboxMessageType::TaskDone),
            "task_failed" => Ok(InboxMessageType::TaskFailed),
            "task_cancelled" => Ok(InboxMessageType::TaskCancelled),
            "task_progress" => Ok(InboxMessageType::TaskProgress),
            _ => Err(format!("Unknown inbox message type: {}", s)),
        }
    }
}

/// Agent status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Busy,
    Offline,
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Idle => write!(f, "idle"),
            AgentStatus::Busy => write!(f, "busy"),
            AgentStatus::Offline => write!(f, "offline"),
        }
    }
}

impl From<AgentStatus> for &'static str {
    fn from(status: AgentStatus) -> Self {
        match status {
            AgentStatus::Idle => "idle",
            AgentStatus::Busy => "busy",
            AgentStatus::Offline => "offline",
        }
    }
}

impl TryFrom<&str> for AgentStatus {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "idle" => Ok(AgentStatus::Idle),
            "busy" => Ok(AgentStatus::Busy),
            "offline" => Ok(AgentStatus::Offline),
            _ => Err(format!("Unknown agent status: {}", s)),
        }
    }
}

// =============================================================================
// Core Data Models
// =============================================================================

/// Plan - created by main agent, contains complete DAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    /// Plan slug, e.g., develop-xx-website-20260328T1000
    pub id: String,

    /// Publisher agent ID (usually orchestrator)
    pub publisher_agent_id: String,

    /// Reply channel (e.g., "feishu")
    pub reply_channel: Option<String>,

    /// User open_id for replying
    pub reply_to: Option<String>,

    /// Plan status
    pub status: PlanStatus,

    /// Plan content (markdown or JSON)
    pub content: String,

    pub created_at: i64,
    pub approved_at: Option<i64>,
    pub completed_at: Option<i64>,
}

impl Plan {
    pub fn new(
        id: String,
        publisher_agent_id: String,
        reply_channel: Option<String>,
        reply_to: Option<String>,
        content: String,
    ) -> Self {
        let now = Utc::now().timestamp();
        Self {
            id,
            publisher_agent_id,
            reply_channel,
            reply_to,
            status: PlanStatus::PendingApproval,
            content,
            created_at: now,
            approved_at: None,
            completed_at: None,
        }
    }
}

/// Task - DAG node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub plan_id: String,
    pub plan_version: i32,
    pub publisher_agent_id: String,
    pub receiver_agent_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub priority: i32,
    pub params: String,
    pub input_artifact_ids: String,
    pub result_schema: String,
    pub status: TaskStatus,
    pub current_run_id: Option<String>,
    pub retry_count: i32,
    pub max_retries: i32,
    pub timeout_seconds: i32,
    pub result: Option<String>,
    pub output_artifact_ids: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub in_progress_at: Option<i64>,
    pub completed_at: Option<i64>,
}

impl Task {
    pub fn new(
        id: String,
        plan_id: String,
        plan_version: i32,
        publisher_agent_id: String,
        receiver_agent_id: String,
        type_: String,
        priority: i32,
        params: String,
        result_schema: String,
        timeout_seconds: i32,
    ) -> Self {
        let now = Utc::now().timestamp();
        Self {
            id,
            plan_id,
            plan_version,
            publisher_agent_id,
            receiver_agent_id,
            type_,
            priority,
            params,
            input_artifact_ids: "[]".to_string(),
            result_schema,
            status: TaskStatus::Pending,
            current_run_id: None,
            retry_count: 0,
            max_retries: 3,
            timeout_seconds,
            result: None,
            output_artifact_ids: "[]".to_string(),
            error: None,
            created_at: now,
            in_progress_at: None,
            completed_at: None,
        }
    }

}

/// Task dependency (DAG edge)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependency {
    pub task_id: String,
    pub depends_on_task_id: String,
}

/// Artifact - file produced by agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: String,
    pub owner_agent_id: String,
    pub task_id: String,
    pub plan_id: String,
    pub filename: String,
    pub file_path: String,
    #[serde(rename = "mime_type")]
    pub mime_type: String,
    pub size_bytes: i64,
    pub status: ArtifactStatus,
    pub created_at: i64,
}

impl Artifact {
    pub fn new(
        id: String,
        owner_agent_id: String,
        task_id: String,
        plan_id: String,
        filename: String,
        file_path: String,
        size_bytes: i64,
    ) -> Self {
        Self {
            id,
            owner_agent_id,
            task_id,
            plan_id,
            filename,
            file_path,
            mime_type: "application/octet-stream".to_string(),
            size_bytes,
            status: ArtifactStatus::Valid,
            created_at: Utc::now().timestamp(),
        }
    }
}

/// Inbox message - agent-to-agent notification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxMessage {
    pub id: String,
    pub to_agent_id: String,
    pub from_agent_id: String,
    #[serde(rename = "type")]
    pub type_: InboxMessageType,
    pub task_id: String,
    pub payload: String,
    pub read: bool,
    pub created_at: i64,
}

impl InboxMessage {
    pub fn new(
        id: String,
        to_agent_id: String,
        from_agent_id: String,
        type_: InboxMessageType,
        task_id: String,
        payload: String,
    ) -> Self {
        Self {
            id,
            to_agent_id,
            from_agent_id,
            type_,
            task_id,
            payload,
            read: false,
            created_at: Utc::now().timestamp(),
        }
    }
}

/// Agent registration info (maintained by daemon via sync from OpenClaw)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub status: AgentStatus,
    pub capabilities: String,
    pub last_seen_at: i64,
}

impl AgentInfo {
    pub fn new(id: String, name: String, capabilities: Vec<String>) -> Self {
        Self {
            id,
            name,
            status: AgentStatus::Idle,
            capabilities: serde_json::to_string(&capabilities).unwrap_or_else(|_| "[]".to_string()),
            last_seen_at: Utc::now().timestamp(),
        }
    }

}

/// Running task snapshot (in-memory, not persisted)
#[derive(Debug, Clone)]
pub struct RunningTask {
    pub task_id: String,
    pub type_: String,
    pub plan_id: String,
    pub started_at: i64,
}

// =============================================================================
// API Request/Response Models
// =============================================================================

/// CreatePlan request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePlanRequest {
    pub id: String,
    pub publisher_agent_id: String,
    pub reply_channel: Option<String>,
    pub reply_to: Option<String>,
    pub content: String,
    pub tasks: Vec<TaskSpec>,
    pub dependencies: Vec<TaskDependencySpec>,
}

/// Task specification for plan creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub id: String,
    pub receiver_agent_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub priority: i32,
    pub params: String,
    pub result_schema: String,
    pub timeout_seconds: Option<i32>,
    pub max_retries: Option<i32>,
}

/// Task dependency specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependencySpec {
    pub task_id: String,
    pub depends_on_task_id: String,
}

/// Plan detail response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanDetail {
    pub plan: Plan,
    pub tasks: Vec<TaskSummary>,
}

/// Task summary for plan details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummary {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub receiver_agent_id: String,
    pub status: TaskStatus,
    pub depends_on: Vec<String>,
    pub in_progress_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}

impl From<Task> for TaskSummary {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            type_: task.type_,
            receiver_agent_id: task.receiver_agent_id,
            status: task.status,
            depends_on: Vec::new(), // populated by DB query
            in_progress_at: task.in_progress_at,
            completed_at: task.completed_at,
            error: task.error,
        }
    }
}

/// List agents response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListAgentsResponse {
    pub agents: Vec<AgentOverview>,
}

/// Agent overview for list
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOverview {
    pub agent_id: String,
    pub status: AgentStatus,
    pub running_task: Option<RunningTaskSummary>,
}

/// Running task summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningTaskSummary {
    pub task_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub plan_id: String,
    pub started_at: i64,
}

impl From<RunningTask> for RunningTaskSummary {
    fn from(task: RunningTask) -> Self {
        Self {
            task_id: task.task_id,
            type_: task.type_,
            plan_id: task.plan_id,
            started_at: task.started_at,
        }
    }
}

/// Agent detail response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDetail {
    pub info: AgentInfo,
    pub running_task: Option<RunningTaskSummary>,
    pub recent_tasks: Vec<TaskSummary>,
}

/// Get agent tasks request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetAgentTasksRequest {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

/// Get agent tasks response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetAgentTasksResponse {
    pub tasks: Vec<Task>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
}

// =============================================================================
// Inbox Message Payloads
// =============================================================================

/// TaskStarted payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStartedPayload {
    pub receiver_agent_id: String,
    pub started_at: i64,
}

/// TaskDone payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDonePayload {
    pub result: String,
    pub output_artifact_ids: Vec<String>,
}

/// TaskFailed payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFailedPayload {
    pub error: String,
    pub retry_count: i32,
}

