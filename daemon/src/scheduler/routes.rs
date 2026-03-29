//! HTTP routes for the scheduler API
//!
//! Implements all scheduler HTTP endpoints for plan and agent management.

use axum::{
    extract::{Path, Query, State},
    Json,
};

use crate::error::{AppError, Result};
use crate::scheduler::models::*;
use crate::state::AppState;

// =============================================================================
// Plan endpoints
// =============================================================================

/// POST /api/plans - Create a new plan with complete DAG
pub async fn create_plan(
    State(state): State<AppState>,
    Json(req): Json<CreatePlanRequest>,
) -> Result<Json<Plan>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;
    let _worker = state.scheduler_worker.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler worker not initialized"))
    })?;
    let _dag = state.scheduler_dag.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler DAG not initialized"))
    })?;

    tracing::info!("Creating plan {} with {} tasks", req.id, req.tasks.len());

    // Validate that all tasks have valid receiver agents
    let all_agents = db.list_agents().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to list agents: {}", e))
    })?;
    let agent_ids: Vec<String> = all_agents.iter().map(|a| a.id.clone()).collect();

    for task in &req.tasks {
        if !agent_ids.contains(&task.receiver_agent_id) {
            return Err(AppError::BadRequest(format!(
                "Unknown agent: {}",
                task.receiver_agent_id
            )));
        }
    }

    // Validate that dependencies reference existing tasks
    let task_ids: Vec<String> = req.tasks.iter().map(|t| t.id.clone()).collect();
    for dep in &req.dependencies {
        if !task_ids.contains(&dep.task_id) {
            return Err(AppError::BadRequest(format!(
                "Dependency references unknown task: {}",
                dep.task_id
            )));
        }
        if !task_ids.contains(&dep.depends_on_task_id) {
            return Err(AppError::BadRequest(format!(
                "Dependency references unknown task: {}",
                dep.depends_on_task_id
            )));
        }

        // Check for circular dependencies
        if has_cycle(&req.dependencies, &dep.task_id)? {
            return Err(AppError::BadRequest(format!(
                "Circular dependency detected involving task {}",
                dep.task_id
            )));
        }
    }

    // Create the plan
    let plan = Plan::new(
        req.id.clone(),
        req.publisher_agent_id.clone(),
        req.reply_channel,
        req.reply_to,
        req.content,
    );
    db.create_plan(&plan).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to create plan: {}", e))
    })?;

    // Create all tasks
    for task_spec in &req.tasks {
        let task = Task::new(
            task_spec.id.clone(),
            plan.id.clone(),
            1,
            req.publisher_agent_id.clone(),
            task_spec.receiver_agent_id.clone(),
            task_spec.type_.clone(),
            task_spec.priority,
            task_spec.params.clone(),
            task_spec.result_schema.clone(),
            task_spec.timeout_seconds.unwrap_or(3600),
        );
        db.create_task(&task).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to create task {}: {}", task.id, e))
        })?;
    }

    // Create all dependencies (convert from TaskDependencySpec to TaskDependency)
    for dep in &req.dependencies {
        let task_dep = TaskDependency {
            task_id: dep.task_id.clone(),
            depends_on_task_id: dep.depends_on_task_id.clone(),
        };
        db.create_dependency(&task_dep).map_err(|e| {
            AppError::Internal(anyhow::anyhow!(
                "Failed to create dependency {}: {}",
                dep.task_id,
                e
            ))
        })?;
    }

    // Initialize artifact directories
    if let Err(e) = super::artifacts::create_task_dir(&plan.id) {
        tracing::warn!("Failed to create plan artifact directory: {}", e);
    }

    tracing::info!("Plan {} created successfully", plan.id);
    Ok(Json(plan))
}

/// PATCH /api/plans/:id/approve - Approve a plan and start execution
pub async fn approve_plan(
    State(state): State<AppState>,
    Path(plan_id): Path<String>,
) -> Result<Json<Plan>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;
    let dag = state.scheduler_dag.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler DAG not initialized"))
    })?;

    tracing::info!("Approving plan {}", plan_id);

    // Check if plan exists
    let plan = db.get_plan(&plan_id).map_err(|e| {
        if e.to_string().contains("not found") {
            AppError::NotFound(format!("Plan not found: {}", plan_id))
        } else {
            AppError::Internal(anyhow::anyhow!("Failed to get plan: {}", e))
        }
    })?;

    // Check if plan can be approved
    match plan.status {
        PlanStatus::PendingApproval => {}
        PlanStatus::Approved => {
            return Err(AppError::BadRequest(format!("Plan {} is already approved", plan_id)));
        }
        PlanStatus::Executing => {
            return Err(AppError::BadRequest(format!(
                "Plan {} is already executing",
                plan_id
            )));
        }
        PlanStatus::Completed => {
            return Err(AppError::BadRequest(format!("Plan {} is already completed", plan_id)));
        }
        PlanStatus::Blocked => {
            return Err(AppError::BadRequest(format!("Plan {} is blocked", plan_id)));
        }
        PlanStatus::Cancelled => {
            return Err(AppError::BadRequest(format!("Plan {} is cancelled", plan_id)));
        }
        PlanStatus::Superseded => {
            return Err(AppError::BadRequest(format!("Plan {} is superseded", plan_id)));
        }
    }

    // Approve the plan
    db.approve_plan(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to approve plan: {}", e))
    })?;

    // Mark as executing
    db.set_plan_executing(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to set plan as executing: {}", e))
    })?;

    // Trigger sweep to start dispatching tasks
    dag.sweep(&plan_id);

    tracing::info!("Plan {} approved and sweep triggered", plan_id);

    // Return updated plan
    let plan = db.get_plan(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to get plan after approve: {}", e))
    })?;
    Ok(Json(plan))
}

/// PATCH /api/plans/:id/cancel - Cancel a plan and all its tasks
pub async fn cancel_plan(
    State(state): State<AppState>,
    Path(plan_id): Path<String>,
) -> Result<Json<Plan>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;

    tracing::info!("Cancelling plan {}", plan_id);

    // Check if plan exists
    let plan = db.get_plan(&plan_id).map_err(|e| {
        if e.to_string().contains("not found") {
            AppError::NotFound(format!("Plan not found: {}", plan_id))
        } else {
            AppError::Internal(anyhow::anyhow!("Failed to get plan: {}", e))
        }
    })?;

    // Check if plan can be cancelled
    match plan.status {
        PlanStatus::Completed => {
            return Err(AppError::BadRequest(format!("Cannot cancel completed plan {}", plan_id)));
        }
        PlanStatus::Cancelled => {
            return Err(AppError::BadRequest(format!("Plan {} is already cancelled", plan_id)));
        }
        PlanStatus::Superseded => {
            return Err(AppError::BadRequest(format!("Plan {} is superseded", plan_id)));
        }
        _ => {}
    }

    // Cancel the plan
    db.cancel_plan(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to cancel plan: {}", e))
    })?;

    // Cancel all pending/in_progress tasks
    db.cancel_tasks_for_plan(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to cancel tasks: {}", e))
    })?;

    // Invalidate artifacts
    let _ = db.invalidate_artifacts_for_plan(&plan_id)
        .map_err(|e| {
            tracing::warn!("Failed to invalidate artifacts: {}", e);
        });

    tracing::info!("Plan {} cancelled", plan_id);

    // Return updated plan
    let plan = db.get_plan(&plan_id).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to get plan after cancel: {}", e))
    })?;
    Ok(Json(plan))
}

/// GET /api/plans/:id - Get plan details with DAG status
pub async fn get_plan(
    State(state): State<AppState>,
    Path(plan_id): Path<String>,
) -> Result<Json<PlanDetail>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;
    let detail = db.get_plan_detail(&plan_id).map_err(|e| {
        if e.to_string().contains("not found") {
            AppError::NotFound(format!("Plan not found: {}", plan_id))
        } else {
            AppError::Internal(anyhow::anyhow!("Failed to get plan detail: {}", e))
        }
    })?;
    Ok(Json(detail))
}

// =============================================================================
// Agent endpoints
// =============================================================================

/// GET /api/agents - List all agents with their status
pub async fn list_agents(
    State(state): State<AppState>,
) -> Result<Json<ListAgentsResponse>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;
    let worker = state.scheduler_worker.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler worker not initialized"))
    })?;

    let agents = db.list_agents().map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to list agents: {}", e))
    })?;

    let mut agent_overviews = Vec::new();

    for agent in agents {
        let running_task = worker
            .get_running_task(&agent.id)
            .map(RunningTaskSummary::from);

        agent_overviews.push(AgentOverview {
            agent_id: agent.id,
            status: agent.status,
            running_task,
        });
    }

    Ok(Json(ListAgentsResponse {
        agents: agent_overviews,
    }))
}

/// GET /api/agents/:id - Get agent details
pub async fn get_agent(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
) -> Result<Json<AgentDetail>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;
    let worker = state.scheduler_worker.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler worker not initialized"))
    })?;

    let info = db.get_agent(&agent_id).map_err(|e| {
        if e.to_string().contains("not found") {
            AppError::NotFound(format!("Agent not found: {}", agent_id))
        } else {
            AppError::Internal(anyhow::anyhow!("Failed to get agent: {}", e))
        }
    })?;

    let running_task = worker
        .get_running_task(&agent_id)
        .map(RunningTaskSummary::from);

    // Get recent tasks (last 10)
    let (tasks, _) = db
        .get_tasks_by_agent(&agent_id, 1, 10)
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to get agent tasks: {}", e))
        })?;

    let recent_tasks: Vec<TaskSummary> = tasks.into_iter().map(TaskSummary::from).collect();

    Ok(Json(AgentDetail {
        info,
        running_task,
        recent_tasks,
    }))
}

/// GET /api/agents/:id/tasks - Get agent task history (paginated)
pub async fn get_agent_tasks(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
    Query(params): Query<GetAgentTasksRequest>,
) -> Result<Json<GetAgentTasksResponse>> {
    let db = state.scheduler_db.as_ref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Scheduler database not initialized"))
    })?;

    let page = params.page.unwrap_or(1);
    let page_size = params.page_size.unwrap_or(20);

    if page < 1 {
        return Err(AppError::BadRequest("Page must be >= 1".to_string()));
    }
    if page_size < 1 || page_size > 100 {
        return Err(AppError::BadRequest("Page size must be between 1 and 100".to_string()));
    }

    let (tasks, total) = db
        .get_tasks_by_agent(&agent_id, page, page_size)
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to get agent tasks: {}", e))
        })?;

    Ok(Json(GetAgentTasksResponse {
        tasks,
        total: total as i32,
        page,
        page_size,
    }))
}

// =============================================================================
// Utility functions
// =============================================================================

/// Check for circular dependencies using DFS
fn has_cycle(
    dependencies: &[TaskDependencySpec],
    start_task_id: &str,
) -> Result<bool> {
    // Build adjacency list
    let mut adj: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for dep in dependencies {
        adj.entry(dep.task_id.clone())
            .or_insert_with(Vec::new)
            .push(dep.depends_on_task_id.clone());
    }

    let mut visited = std::collections::HashSet::new();
    let mut rec_stack = std::collections::HashSet::new();

    let result = dfs_cycle_check(&adj, start_task_id, &mut visited, &mut rec_stack);
    Ok(result)
}

fn dfs_cycle_check(
    adj: &std::collections::HashMap<String, Vec<String>>,
    node: &str,
    visited: &mut std::collections::HashSet<String>,
    rec_stack: &mut std::collections::HashSet<String>,
) -> bool {
    visited.insert(node.to_string());
    rec_stack.insert(node.to_string());

    if let Some(neighbors) = adj.get(node) {
        for neighbor in neighbors {
            if !visited.contains(neighbor) {
                if dfs_cycle_check(adj, neighbor, visited, rec_stack) {
                    return true;
                }
            } else if rec_stack.contains(neighbor) {
                return true;
            }
        }
    }

    rec_stack.remove(node);
    false
}

/// Create the scheduler router
pub fn scheduler_router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/plans", axum::routing::post(create_plan))
        .route(
            "/api/plans/:id/approve",
            axum::routing::patch(approve_plan),
        )
        .route("/api/plans/:id/cancel", axum::routing::patch(cancel_plan))
        .route("/api/plans/:id", axum::routing::get(get_plan))
        .route("/api/agents", axum::routing::get(list_agents))
        .route("/api/agents/:id", axum::routing::get(get_agent))
        .route(
            "/api/agents/:id/tasks",
            axum::routing::get(get_agent_tasks),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scheduler::Db;
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[test]
    fn test_has_cycle_no_cycle() {
        let dependencies = vec![
            TaskDependencySpec {
                task_id: "t2".to_string(),
                depends_on_task_id: "t1".to_string(),
            },
            TaskDependencySpec {
                task_id: "t3".to_string(),
                depends_on_task_id: "t2".to_string(),
            },
        ];

        assert!(!has_cycle(&dependencies, "t3").unwrap());
    }

    #[test]
    fn test_has_cycle_with_cycle() {
        let dependencies = vec![
            TaskDependencySpec {
                task_id: "t1".to_string(),
                depends_on_task_id: "t2".to_string(),
            },
            TaskDependencySpec {
                task_id: "t2".to_string(),
                depends_on_task_id: "t3".to_string(),
            },
            TaskDependencySpec {
                task_id: "t3".to_string(),
                depends_on_task_id: "t1".to_string(),
            },
        ];

        assert!(has_cycle(&dependencies, "t1").unwrap());
    }
}