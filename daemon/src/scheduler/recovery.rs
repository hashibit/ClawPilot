//! Recovery and timer-based operations
//!
//! Handles startup recovery, timeout handling, auto-approval,
//! agent sync, and periodic DAG sweeping.

use crate::openclaw_client;
use crate::scheduler::{Db, Worker, DagScheduler, models::*};

/// Recovery handles startup recovery and timer-based operations
#[derive(Clone)]
pub struct Recovery {
    db: Db,
    worker: Worker,
    dag: DagScheduler,
}

impl Recovery {
    pub fn new(db: Db, worker: Worker, dag: DagScheduler) -> Self {
        Self { db, worker, dag }
    }

    /// Recover state on daemon startup
    ///
    /// 1. Check if OpenClaw gateway is online
    /// 2. Reset all in_progress tasks to pending
    /// 3. Send stop messages to agents if gateway is online
    /// 4. Sweep all executing plans
    pub async fn recover_on_startup(&self) {
        tracing::info!("Recovering state on startup...");

        // 1. Check OpenClaw gateway health
        let gateway_online = self.check_gateway_health().await;

        // 2. Reset all in_progress tasks to pending
        let in_progress_tasks = match self.db.get_in_progress_tasks() {
            Ok(tasks) => tasks,
            Err(e) => {
                tracing::error!("Failed to get in_progress tasks: {}", e);
                return;
            }
        };

        if in_progress_tasks.is_empty() {
            tracing::info!("No in-progress tasks to recover");
        } else {
            tracing::info!(
                "Found {} in-progress tasks to recover",
                in_progress_tasks.len()
            );

            for task in &in_progress_tasks {
                if gateway_online {
                    // Send stop message to ensure agent session is clean
                    tracing::info!(
                        "Sending stop message to agent {} for task {}",
                        task.receiver_agent_id,
                        task.id
                    );
                    let _ = self.worker.stop_task(&task.receiver_agent_id);
                }

                // Reset task to pending
                if let Err(e) = self.db.reset_task_to_pending(&task.id) {
                    tracing::error!("Failed to reset task {} to pending: {}", task.id, e);
                }
            }
        }

        // 3. Sweep all executing plans
        let executing_plans = match self.db.get_executing_plans() {
            Ok(plans) => plans,
            Err(e) => {
                tracing::error!("Failed to get executing plans: {}", e);
                return;
            }
        };

        if executing_plans.is_empty() {
            tracing::info!("No executing plans to sweep");
        } else {
            tracing::info!(
                "Sweeping {} executing plans",
                executing_plans.len()
            );
            for plan in &executing_plans {
                tracing::info!("Sweeping plan {}", plan.id);
                self.dag.sweep(&plan.id);
            }
        }

        tracing::info!("Recovery complete");
    }

    /// Handle timed-out tasks
    pub async fn handle_timeouts(&self) {
        let timed_out = match self.db.get_timed_out_tasks() {
            Ok(tasks) => tasks,
            Err(e) => {
                tracing::error!("Failed to get timed out tasks: {}", e);
                return;
            }
        };

        if timed_out.is_empty() {
            return;
        }

        tracing::info!("Found {} timed out tasks", timed_out.len());

        for task in &timed_out {
            if task.retry_count < task.max_retries {
                tracing::info!(
                    "Retrying timed out task {} ({}/{})",
                    task.id,
                    task.retry_count + 1,
                    task.max_retries
                );
                if let Err(e) = self.db.increment_retry_and_reset(&task.id) {
                    tracing::error!("Failed to retry task {}: {}", task.id, e);
                }
            } else {
                tracing::warn!(
                    "Task {} exceeded max retries ({}) due to timeout",
                    task.id,
                    task.max_retries
                );
                if let Err(e) = self.db.mark_task_failed(&task.id, "Timeout exceeded") {
                    tracing::error!("Failed to mark task {} as failed: {}", task.id, e);
                }
            }
        }
    }

    /// Auto-approve plans that have been pending approval too long
    pub async fn auto_approve_expired_plans(&self, timeout_secs: i64) {
        let expired = match self.db.get_pending_approval_plans_older_than(timeout_secs) {
            Ok(plans) => plans,
            Err(e) => {
                tracing::error!("Failed to get expired plans: {}", e);
                return;
            }
        };

        if expired.is_empty() {
            return;
        }

        tracing::info!(
            "Auto-approving {} expired plans (timeout: {}s)",
            expired.len(),
            timeout_secs
        );

        for plan in &expired {
            tracing::info!("Auto-approving plan {}", plan.id);
            if let Err(e) = self.db.approve_plan(&plan.id) {
                tracing::error!("Failed to approve plan {}: {}", plan.id, e);
                continue;
            }

            // Trigger sweep to start execution
            self.dag.sweep(&plan.id);
        }
    }

    /// Sync agent list from OpenClaw
    pub async fn sync_agents_from_openclaw(&self) {
        tracing::debug!("Syncing agents from OpenClaw...");

        // Use openclaw_client to list agents
        let agents_result = openclaw_client::list_agents().await;
        let agents_array = match agents_result {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to list agents from OpenClaw: {}", e);
                return;
            }
        };

        // Parse agents from the response
        let mut current_agent_ids = Vec::new();
        for agent_value in &agents_array {
            if let Some(agent_obj) = agent_value.as_object() {
                if let (Some(id), Some(name)) = (
                    agent_obj.get("id").and_then(|v| v.as_str()),
                    agent_obj.get("name").and_then(|v| v.as_str()),
                ) {
                    // Parse capabilities
                    let capabilities = agent_obj
                        .get("capabilities")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();

                    // Create or update agent
                    let agent_info = AgentInfo::new(
                        id.to_string(),
                        name.to_string(),
                        capabilities,
                    );
                    if let Err(e) = self.db.upsert_agent(&agent_info) {
                        tracing::error!("Failed to upsert agent {}: {}", id, e);
                    }

                    current_agent_ids.push(id.to_string());
                }
            }
        }

        // Mark agents that are no longer in the list as offline
        if let Ok(all_agents) = self.db.list_agents() {
            for agent in all_agents {
                if !current_agent_ids.contains(&agent.id) {
                    let agent_id = &agent.id;
                    tracing::debug!("Marking agent {} as offline", agent_id);
                    if let Err(e) = self.db.mark_agent_offline(agent_id) {
                        tracing::error!("Failed to mark agent {} as offline: {}", agent_id, e);
                    }
                }
            }
        }

        tracing::debug!("Agent sync complete, {} agents online", current_agent_ids.len());
    }

    /// Sweep all executing plans (called by timer)
    pub async fn sweep_all_executing_plans(&self) {
        let executing_plans = match self.db.get_executing_plans() {
            Ok(plans) => plans,
            Err(e) => {
                tracing::error!("Failed to get executing plans: {}", e);
                return;
            }
        };

        if executing_plans.is_empty() {
            return;
        }

        tracing::debug!("Sweeping {} executing plans", executing_plans.len());

        for plan in &executing_plans {
            self.dag.sweep(&plan.id);
        }
    }

    /// Check if OpenClaw gateway is online
    async fn check_gateway_health(&self) -> bool {
        openclaw_client::is_available().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[tokio::test]
    async fn test_recovery_new() {
        let db = create_test_db();
        let worker = Worker::new();
        let dag = DagScheduler::new(db.clone(), worker.clone());
        let recovery = Recovery::new(db, worker, dag);

        // Check gateway health (should not panic)
        let online = recovery.check_gateway_health().await;
        tracing::info!("Gateway online: {}", online);
    }

    #[tokio::test]
    async fn test_handle_timeouts_no_tasks() {
        let db = create_test_db();
        let worker = Worker::new();
        let dag = DagScheduler::new(db.clone(), worker.clone());
        let recovery = Recovery::new(db, worker, dag);

        // Should handle empty timeout list gracefully
        recovery.handle_timeouts().await;
    }

    #[tokio::test]
    async fn test_auto_approve_no_plans() {
        let db = create_test_db();
        let worker = Worker::new();
        let dag = DagScheduler::new(db.clone(), worker.clone());
        let recovery = Recovery::new(db, worker, dag);

        // Should handle empty plan list gracefully
        recovery.auto_approve_expired_plans(120).await;
    }
}