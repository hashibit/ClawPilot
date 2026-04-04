//! Worker module for task execution and process management
//!
//! Handles spawning OpenClaw agent processes, tracking running tasks,
//! and monitoring process completion.

use anyhow::{Context, Result};
use chrono::Utc;
use dashmap::DashMap;
use serde_json::Value;
use std::sync::Arc;
use tokio::process::Command;
use tokio::io::AsyncReadExt;
use std::process::Stdio;
use tokio::task::JoinHandle;

use crate::openclaw_client;
use crate::scheduler::{Db, models::*};
use crate::utils::extract_json;

/// Worker manages task execution via OpenClaw agent processes
#[derive(Clone)]
pub struct Worker {
    running_tasks: Arc<DashMap<String, RunningTask>>, // agent_id -> RunningTask
    task_handles: Arc<DashMap<String, JoinHandle<()>>>, // task_id -> handle
    /// Channel to request DAG sweep for a plan after task completion
    sweep_tx: Option<Arc<tokio::sync::mpsc::UnboundedSender<String>>>,
}

impl Worker {
    pub fn new() -> Self {
        Self {
            running_tasks: Arc::new(DashMap::new()),
            task_handles: Arc::new(DashMap::new()),
            sweep_tx: None,
        }
    }

    /// Create worker with a sweep trigger channel
    pub fn new_with_sweep(sweep_tx: Arc<tokio::sync::mpsc::UnboundedSender<String>>) -> Self {
        Self {
            running_tasks: Arc::new(DashMap::new()),
            task_handles: Arc::new(DashMap::new()),
            sweep_tx: Some(sweep_tx),
        }
    }

    /// Check if an agent is currently busy (running a task)
    pub fn is_busy(&self, agent_id: &str) -> bool {
        self.running_tasks.contains_key(agent_id)
    }

    /// Get the currently running task for an agent
    pub fn get_running_task(&self, agent_id: &str) -> Option<RunningTask> {
        self.running_tasks.get(agent_id).map(|t| t.clone())
    }

    /// Start executing a task via OpenClaw agent
    pub fn start_task(&self, task: &Task, db: &Db) -> Result<()> {
        // Check if agent is already busy
        if self.is_busy(&task.receiver_agent_id) {
            return Err(anyhow::anyhow!(
                "Agent {} is already running a task",
                task.receiver_agent_id
            ));
        }

        // Build the context message for the agent
        let context = super::context::build_context(task, db)?;

        // Generate run_id for this execution
        let run_id = format!("run-{}-{}", task.id, uuid::Uuid::new_v4().to_string()[..8].to_string());

        // Pre-create artifact directory using new structure
        let artifact_dir = format!("./artifacts/plans/{}/{}/{}",
            task.plan_id, task.receiver_agent_id, run_id);
        std::fs::create_dir_all(&artifact_dir)
            .context("Failed to create artifact directory")?;

        tracing::info!("Starting task {} with run_id: {} context length: {}", task.id, run_id, context.len());

        // Spawn the OpenClaw agent process
        let child = Command::new("openclaw")
            .args([
                "agent",
                "--agent", &task.receiver_agent_id,
                "--message", &context,
                "--timeout", &task.timeout_seconds.to_string(),
                "--json",
            ])
            .env("PATH", openclaw_client::extended_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn openclaw agent")?;

        // Update task with run_id and status
        db.update_task_run_id(&task.id, &run_id)?;
        db.update_task_status(&task.id, TaskStatus::InProgress)?;

        // Track running task
        let running = RunningTask {
            task_id: task.id.clone(),
            type_: task.type_.clone(),
            plan_id: task.plan_id.clone(),
            started_at: Utc::now().timestamp(),
        };
        self.running_tasks.insert(task.receiver_agent_id.clone(), running.clone());

        // Send task_started message to publisher's inbox
        let started_payload = TaskStartedPayload {
            receiver_agent_id: task.receiver_agent_id.clone(),
            started_at: Utc::now().timestamp(),
        };
        if let Ok(payload_json) = serde_json::to_string(&started_payload) {
            let msg = InboxMessage::new(
                format!("msg-start-{}", task.id),
                task.publisher_agent_id.clone(),
                "daemon".to_string(),
                InboxMessageType::TaskStarted,
                task.id.clone(),
                payload_json,
            );
            let _ = db.create_inbox_message(&msg);
        }

        // Spawn async task to monitor process completion
        let db_clone = db.clone();
        let task_id = task.id.clone();
        let receiver_agent_id = task.receiver_agent_id.clone();
        let plan_id = task.plan_id.clone();
        let publisher_agent_id = task.publisher_agent_id.clone();
        let running_tasks = self.running_tasks.clone();
        let task_handles = self.task_handles.clone();
        let sweep_tx_clone = self.sweep_tx.clone();

        let handle = tokio::spawn(async move {
            let result = Self::monitor_process(child, task_id.clone(), db_clone.clone()).await;

            // Remove from running tasks
            running_tasks.remove(&receiver_agent_id);
            task_handles.remove(&task_id);

            // Handle completion
            match result {
                Ok(completion_result) => {
                    tracing::info!("Task {} completed successfully", task_id);

                    // Mark task as completed in DB
                    if let Err(e) = db_clone.mark_task_completed(
                        &task_id,
                        &completion_result.result,
                        completion_result.output_artifact_ids.clone(),
                    ) {
                        tracing::error!("Failed to mark task {} as completed: {}", task_id, e);
                    }

                    // Send task_done message to publisher
                    let done_payload = TaskDonePayload {
                        result: completion_result.result,
                        output_artifact_ids: completion_result.output_artifact_ids,
                    };
                    if let Ok(payload_json) = serde_json::to_string(&done_payload) {
                        let msg = InboxMessage::new(
                            format!("msg-done-{}", task_id),
                            publisher_agent_id.clone(),
                            receiver_agent_id.clone(),
                            InboxMessageType::TaskDone,
                            task_id.clone(),
                            payload_json,
                        );
                        let _ = db_clone.create_inbox_message(&msg);
                    }

                    // Trigger DAG sweep for dependent tasks
                    let ready_tasks = db_clone.get_ready_tasks(&plan_id);
                    if !ready_tasks.is_empty() {
                        tracing::info!("Task {} completion: {} ready tasks", task_id, ready_tasks.len());
                    }
                    if let Some(tx) = &sweep_tx_clone {
                        let _ = tx.send(plan_id.clone());
                    }
                }
                Err(e) => {
                    tracing::error!("Task {} failed: {}", task_id, e);

                    // Get current retry count
                    let task = db_clone.get_task(&task_id);
                    if let Ok(t) = task {
                        if t.retry_count < t.max_retries {
                            tracing::info!("Retrying task {} ({}/{})", task_id, t.retry_count + 1, t.max_retries);
                            if let Err(err) = db_clone.increment_retry_and_reset(&task_id) {
                                tracing::error!("Failed to increment retry for task {}: {}", task_id, err);
                            }

                            // Send retry notification
                            let failed_payload = TaskFailedPayload {
                                error: e.to_string(),
                                retry_count: t.retry_count + 1,
                            };
                            if let Ok(payload_json) = serde_json::to_string(&failed_payload) {
                                let msg = InboxMessage::new(
                                    format!("msg-fail-{}", task_id),
                                    publisher_agent_id.clone(),
                                    receiver_agent_id.clone(),
                                    InboxMessageType::TaskFailed,
                                    task_id.clone(),
                                    payload_json,
                                );
                                let _ = db_clone.create_inbox_message(&msg);
                            }
                        } else {
                            tracing::error!("Task {} exceeded max retries ({})", task_id, t.max_retries);
                            if let Err(err) = db_clone.mark_task_failed(&task_id, &e.to_string()) {
                                tracing::error!("Failed to mark task {} as failed: {}", task_id, err);
                            }

                            // Send final failure notification
                            let failed_payload = TaskFailedPayload {
                                error: e.to_string(),
                                retry_count: t.retry_count,
                            };
                            if let Ok(payload_json) = serde_json::to_string(&failed_payload) {
                                let msg = InboxMessage::new(
                                    format!("msg-fail-{}", task_id),
                                    publisher_agent_id.clone(),
                                    receiver_agent_id.clone(),
                                    InboxMessageType::TaskFailed,
                                    task_id.clone(),
                                    payload_json,
                                );
                                let _ = db_clone.create_inbox_message(&msg);
                            }
                        }
                    }
                }
            }
        });

        self.task_handles.insert(task.id.clone(), handle);

        Ok(())
    }

    /// Stop a running task by agent ID
    pub fn stop_task(&self, agent_id: &str) -> Result<()> {
        if let Some((_, running)) = self.running_tasks.remove(agent_id) {
            tracing::info!("Stopping task {} for agent {}", running.task_id, agent_id);

            // Cancel the monitoring task
            if let Some((_, handle)) = self.task_handles.remove(&running.task_id) {
                handle.abort();
            }

            // Send stop message to ensure agent session is clean
            let _ = Command::new("openclaw")
                .args(["agent", "--agent", agent_id, "--message", "stop"])
                .env("PATH", openclaw_client::extended_path())
                .spawn();

            Ok(())
        } else {
            Err(anyhow::anyhow!("No running task for agent {}", agent_id))
        }
    }

    /// Monitor the OpenClaw agent process and parse its output
    async fn monitor_process(
        mut child: tokio::process::Child,
        task_id: String,
        db: Db,
    ) -> Result<TaskCompletionResult> {
        // Read stdout
        let stdout = child.stdout.take().context("Failed to capture stdout")?;
        let stderr = child.stderr.take().context("Failed to capture stderr")?;

        // Spawn tasks to read stdout and stderr
        let stdout_handle = tokio::spawn(async move {
            let mut output = Vec::new();
            let mut reader = stdout;
            let _ = reader.read_to_end(&mut output).await;
            String::from_utf8_lossy(&output).to_string()
        });

        let stderr_handle = tokio::spawn(async move {
            let mut output = Vec::new();
            let mut reader = stderr;
            let _ = reader.read_to_end(&mut output).await;
            String::from_utf8_lossy(&output).to_string()
        });

        // Wait for process completion
        let exit_status = child.wait().await.context("Failed to wait for process")?;

        let stdout_output = stdout_handle.await.unwrap_or_default();
        let stderr_output = stderr_handle.await.unwrap_or_default();

        tracing::debug!(
            "Task {} process exited with status: {:?}",
            task_id,
            exit_status
        );
        if !stdout_output.is_empty() {
            tracing::debug!("Task {} stdout: {}", task_id, stdout_output);
        }
        if !stderr_output.is_empty() {
            tracing::debug!("Task {} stderr: {}", task_id, stderr_output);
        }

        if !exit_status.success() {
            let err_snippet = stderr_output.lines().take(5).collect::<Vec<_>>().join(" | ");
            return Err(anyhow::anyhow!(
                "Process exited with non-zero status: {:?}. stderr: {}",
                exit_status,
                err_snippet
            ));
        }

        // Parse the output.
        // openclaw --json outputs to stderr: {"payloads":[{"text":"..."}],"meta":{...}}
        // The agent text should be JSON: {"status":"done|failed","error":"...","data":{...}}
        // Fallback: treat any non-empty output as success.
        // Use stderr if stdout is empty (openclaw writes JSON to stderr with --json flag).
        let stdout_trimmed = stdout_output.trim();
        let stderr_trimmed = stderr_output.trim();
        let output_text = if !stdout_trimmed.is_empty() {
            stdout_trimmed
        } else {
            stderr_trimmed
        };

        if output_text.is_empty() {
            return Err(anyhow::anyhow!("Agent returned empty output"));
        }

        // Try to parse as JSON (handle mixed text+JSON output from openclaw)
        let clean_json = extract_json(output_text)
            .ok_or_else(|| anyhow::anyhow!("No JSON found in agent output: {}",
                &output_text[..output_text.len().min(200)]))?;
        let json: Value = serde_json::from_str(&clean_json)
            .with_context(|| format!("Failed to parse agent JSON: {}", clean_json))?;

        // Extract the actual agent text from openclaw's --json wrapper if present
        let agent_text = json.get("payloads")
            .and_then(|p| p.as_array())
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("text"))
            .and_then(|t| t.as_str());

        // Try to parse agent text as task result JSON
        let result_json: Option<Value> = agent_text
            .and_then(|text| serde_json::from_str(text).ok());

        // Determine the result JSON to use
        let effective_json = result_json.as_ref().unwrap_or(&json);

        let status = effective_json.get("status")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| {
                // If we have agent text but it's not our protocol format, treat as done
                if agent_text.is_some() { "done" } else { "unknown" }
            });

        match status {
            "done" => {
                // Extract result and artifacts
                let result = effective_json.get("data")
                    .map(|v| serde_json::to_string(v).unwrap_or_default())
                    .or_else(|| agent_text.map(|t| format!("{{\"result\":{:?}}}", t)))
                    .unwrap_or_else(|| "{}".to_string());

                let output_artifacts: Vec<String> = effective_json.get("output_artifact_ids")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                // Discover artifacts in the task directory
                let discovered = Self::discover_artifacts(&task_id, &db)?;
                let all_artifacts: Vec<String> = output_artifacts
                    .into_iter()
                    .chain(discovered)
                    .collect();

                Ok(TaskCompletionResult {
                    result,
                    output_artifact_ids: all_artifacts,
                })
            }
            "failed" => {
                let error = effective_json.get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");

                Err(anyhow::anyhow!("Agent reported failure: {}", error))
            }
            _ => {
                Err(anyhow::anyhow!("Unknown agent status: {}", status))
            }
        }
    }

    /// Discover artifacts created by the agent in the task directory
    fn discover_artifacts(task_id: &str, db: &Db) -> Result<Vec<String>> {
        // Get task to determine artifact directory
        let task = db.get_task(task_id)?;
        let task_dir = if let Some(run_id) = &task.current_run_id {
            format!("./artifacts/plans/{}/{}/{}",
                task.plan_id, task.receiver_agent_id, run_id)
        } else {
            format!("./artifacts/plans/{}/{}/<unknown>", task.plan_id, task.receiver_agent_id)
        };

        let mut artifact_ids = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&task_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        let filename = entry.file_name().to_string_lossy().to_string();
                        let file_path = entry.path().to_string_lossy().to_string();

                        // Check if artifact already exists
                        let existing = db.get_artifacts_by_task(task_id);
                        let exists = existing.as_ref().map_or(false, |arts| {
                            arts.iter().any(|a| a.filename == filename)
                        });

                        if !exists {
                            // Register new artifact
                            let artifact_id = format!("art-{}-{}", task_id, uuid::Uuid::new_v4());
                            let size = metadata.len() as i64;

                            // Get task to extract plan_id and owner_agent_id
                            let task = db.get_task(task_id)?;
                            let artifact = Artifact::new(
                                artifact_id.clone(),
                                task.receiver_agent_id.clone(),
                                task_id.to_string(),
                                task.plan_id.clone(),
                                filename,
                                file_path,
                                size,
                            );

                            let _ = db.create_artifact(&artifact);
                            artifact_ids.push(artifact_id);
                        }
                    }
                }
            }
        }

        Ok(artifact_ids)
    }

}

#[derive(Debug, Clone)]
struct TaskCompletionResult {
    result: String,
    output_artifact_ids: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worker_new() {
        let worker = Worker::new();
        assert!(!worker.is_busy("test-agent"));
    }

    #[test]
    fn test_is_busy() {
        let worker = Worker::new();
        assert!(!worker.is_busy("agent-1"));

        // Simulate adding a running task
        let running = RunningTask {
            task_id: "task-1".to_string(),
            type_: "test".to_string(),
            plan_id: "plan-1".to_string(),
            started_at: Utc::now().timestamp(),
        };
        worker.running_tasks.insert("agent-1".to_string(), running);

        assert!(worker.is_busy("agent-1"));
    }
}