//! DAG (Directed Acyclic Graph) scheduling logic
//!
//! Handles task dependency resolution and dispatches ready tasks.

use crate::scheduler::{Db, Worker};
use crate::scheduler::models::PlanStatus;

/// DAG scheduler for traversing and executing task graphs
#[derive(Clone)]
pub struct DagScheduler {
    db: Db,
    worker: Worker,
}

impl DagScheduler {
    pub fn new(db: Db, worker: Worker) -> Self {
        Self { db, worker }
    }

    /// Sweep a plan: dispatch all ready tasks whose dependencies are complete
    ///
    /// This is called:
    /// 1. Immediately when a task completes
    /// 2. By the internal timer (catch-all for any missed dispatches)
    pub fn sweep(&self, plan_id: &str) {
        tracing::debug!("Sweeping plan: {}", plan_id);

        let ready_tasks = self.db.get_ready_tasks(plan_id);

        if ready_tasks.is_empty() {
            tracing::debug!("No ready tasks for plan {}", plan_id);
            // Still check for plan completion — all tasks may be done
            self.check_plan_completion(plan_id);
            return;
        }

        tracing::info!("Found {} ready tasks for plan {}", ready_tasks.len(), plan_id);

        for task in ready_tasks {
            // Check if agent is busy
            if self.worker.is_busy(&task.receiver_agent_id) {
                tracing::debug!(
                    "Agent {} is busy, skipping task {}",
                    task.receiver_agent_id,
                    task.id
                );
                continue;
            }

            // Start the task
            match self.worker.start_task(&task, &self.db) {
                Ok(_) => {
                    tracing::info!(
                        "Started task {} (type: {}) for agent {}",
                        task.id,
                        task.type_,
                        task.receiver_agent_id
                    );
                }
                Err(e) => {
                    tracing::error!("Failed to start task {}: {}", task.id, e);
                    if let Err(err) = self.db.mark_task_failed(&task.id, &e.to_string()) {
                        tracing::error!("Failed to mark task {} as failed: {}", task.id, err);
                    }
                }
            }
        }

        // Check if the plan is fully complete after this sweep
        self.check_plan_completion(plan_id);
    }

    /// Check whether all tasks in a plan are done. If so, mark the plan completed
    /// and notify the publisher agent so it can reply to the original user.
    fn check_plan_completion(&self, plan_id: &str) {
        // Only act on executing plans
        let plan = match self.db.get_plan(plan_id) {
            Ok(p) => p,
            Err(_) => return,
        };
        if plan.status != PlanStatus::Executing {
            return;
        }

        if !self.db.is_plan_all_tasks_done(plan_id) {
            return;
        }

        let has_failures = self.db.has_failed_tasks(plan_id);

        if let Err(e) = self.db.complete_plan(plan_id) {
            tracing::error!("Failed to mark plan {} as completed: {}", plan_id, e);
            return;
        }

        tracing::info!(
            "Plan {} completed (failures: {}). Notifying publisher agent {}",
            plan_id,
            has_failures,
            plan.publisher_agent_id
        );

        // Notify the publisher agent (orchestrator) so it can reply to the user
        self.notify_publisher(&plan, has_failures);
    }

    /// Spawn `openclaw agent` to notify the orchestrator that the plan is done.
    /// The orchestrator's SOUL.md instructs it to send a Feishu reply using reply_to.
    fn notify_publisher(&self, plan: &crate::scheduler::models::Plan, has_failures: bool) {
        let status_word = if has_failures { "部分失败" } else { "成功" };
        let reply_hint = match (&plan.reply_channel, &plan.reply_to) {
            (Some(ch), Some(to)) => format!("请通过 {} 回复用户（{}）执行结果。", ch, to),
            _ => String::new(),
        };

        let message = format!(
            "任务计划 {} 已{}完成。{}\n计划内容：{}",
            plan.id, status_word, reply_hint, plan.content
        );

        let agent_id = plan.publisher_agent_id.clone();
        tracing::info!("Notifying publisher agent: {}", agent_id);

        // Fire-and-forget: spawn in a separate thread to avoid blocking the sweep
        std::thread::spawn(move || {
            let result = std::process::Command::new("openclaw")
                .args(["agent", "--agent", &agent_id, "--message", &message])
                .output();

            match result {
                Ok(out) if out.status.success() => {
                    tracing::info!("Publisher agent {} notified successfully", agent_id);
                }
                Ok(out) => {
                    tracing::warn!(
                        "Publisher agent {} notification exited with error: {}",
                        agent_id,
                        String::from_utf8_lossy(&out.stderr)
                    );
                }
                Err(e) => {
                    tracing::error!("Failed to notify publisher agent {}: {}", agent_id, e);
                }
            }
        });
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scheduler::models::{Plan, Task, TaskDependency};
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[test]
    fn test_dag_sweep_no_ready_tasks() {
        let db = create_test_db();
        let worker = Worker::new();
        let scheduler = DagScheduler::new(db, worker);

        // Sweep on non-existent plan should not panic
        scheduler.sweep("non-existent-plan");
    }

    #[test]
    fn test_dag_simple_chain() {
        let db = create_test_db();
        let worker = Worker::new();
        let scheduler = DagScheduler::new(db.clone(), worker);

        // Create a simple chain: t1 -> t2 -> t3
        let plan_id = "test-plan-1";
        let plan = Plan::new(
            plan_id.to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        let mut t1 = Task::new(
            "t1".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-1".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t1).unwrap();

        let mut t2 = Task::new(
            "t2".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-1".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t2).unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t2".to_string(),
            depends_on_task_id: "t1".to_string(),
        })
        .unwrap();

        let mut t3 = Task::new(
            "t3".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-1".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t3).unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t3".to_string(),
            depends_on_task_id: "t2".to_string(),
        })
        .unwrap();

        // Initially only t1 should be ready
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t1");

        // After t1 completes, t2 should be ready
        db.mark_task_completed("t1", "result", vec![]).unwrap();
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t2");

        // After t2 completes, t3 should be ready
        db.mark_task_completed("t2", "result", vec![]).unwrap();
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t3");
    }

    #[test]
    fn test_dag_parallel_branches() {
        let db = create_test_db();
        let worker = Worker::new();
        let scheduler = DagScheduler::new(db.clone(), worker);

        // Create parallel branches: t1 -> (t2, t3) -> t4
        let plan_id = "test-plan-2";
        let plan = Plan::new(
            plan_id.to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        let mut t1 = Task::new(
            "t1".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-1".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t1).unwrap();

        let mut t2 = Task::new(
            "t2".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-2".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t2).unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t2".to_string(),
            depends_on_task_id: "t1".to_string(),
        })
        .unwrap();

        let mut t3 = Task::new(
            "t3".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-3".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t3).unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t3".to_string(),
            depends_on_task_id: "t1".to_string(),
        })
        .unwrap();

        let mut t4 = Task::new(
            "t4".to_string(),
            plan_id.to_string(),
            1,
            "orchestrator".to_string(),
            "worker-1".to_string(),
            "test".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            60,
        );
        db.create_task(&t4).unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t4".to_string(),
            depends_on_task_id: "t2".to_string(),
        })
        .unwrap();
        db.create_dependency(&TaskDependency {
            task_id: "t4".to_string(),
            depends_on_task_id: "t3".to_string(),
        })
        .unwrap();

        // Initially only t1 should be ready
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t1");

        // After t1 completes, both t2 and t3 should be ready (different agents)
        db.mark_task_completed("t1", "result", vec![]).unwrap();
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 2);
        assert!(ready.iter().any(|t| t.id == "t2"));
        assert!(ready.iter().any(|t| t.id == "t3"));

        // After t2 completes, t3 is still pending (its dep t1 was already completed)
        // so t3 should still appear as ready.
        db.mark_task_completed("t2", "result", vec![]).unwrap();
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1); // t3 ready (dep t1 done), t4 not yet (t3 still pending)
        assert!(ready.iter().any(|t| t.id == "t3"));

        db.mark_task_completed("t3", "result", vec![]).unwrap();
        let ready = db.get_ready_tasks(plan_id);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t4");
    }
}