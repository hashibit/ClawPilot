//! Database operations for the multi-agent scheduler
//!
//! Handles SQLite initialization, migrations, and CRUD operations.

use anyhow::Context;
use chrono::Utc;
use rusqlite::{params, Connection, Result as SqliteResult};
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::scheduler::models::*;

/// Database connection wrapper with thread-safe access
#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// Open or create database at the given path
    pub fn new(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path).context("Failed to open database")?;
        Self::migrate(&conn).context("Failed to run migrations")?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Create an in-memory database (used in tests)
    #[cfg(test)]
    pub fn new_in_memory() -> anyhow::Result<Self> {
        let conn = Connection::open_in_memory().context("Failed to open in-memory database")?;
        Self::migrate(&conn).context("Failed to run migrations")?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Run database migrations
    fn migrate(conn: &Connection) -> SqliteResult<()> {
        conn.execute_batch(
            r#"
            -- Plans table
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                publisher_agent_id TEXT NOT NULL,
                reply_channel TEXT,
                reply_to TEXT,
                status TEXT NOT NULL DEFAULT 'pending_approval',
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                approved_at INTEGER,
                completed_at INTEGER
            );

            -- Tasks table
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                plan_version INTEGER NOT NULL,
                publisher_agent_id TEXT NOT NULL,
                receiver_agent_id TEXT NOT NULL,
                type TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                params TEXT NOT NULL DEFAULT '{}',
                input_artifact_ids TEXT NOT NULL DEFAULT '[]',
                result_schema TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending',
                current_run_id TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                max_retries INTEGER NOT NULL DEFAULT 3,
                timeout_seconds INTEGER NOT NULL DEFAULT 3600,
                result TEXT,
                output_artifact_ids TEXT NOT NULL DEFAULT '[]',
                error TEXT,
                created_at INTEGER NOT NULL,
                in_progress_at INTEGER,
                completed_at INTEGER,
                FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
            );

            -- Task dependencies table
            CREATE TABLE IF NOT EXISTS task_dependencies (
                task_id TEXT NOT NULL,
                depends_on_task_id TEXT NOT NULL,
                PRIMARY KEY (task_id, depends_on_task_id),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );

            -- Inbox messages table
            CREATE TABLE IF NOT EXISTS inbox_messages (
                id TEXT PRIMARY KEY,
                to_agent_id TEXT NOT NULL,
                from_agent_id TEXT NOT NULL,
                type TEXT NOT NULL,
                task_id TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                read INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            -- Artifacts table
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                owner_agent_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'valid',
                created_at INTEGER NOT NULL
            );

            -- Agents table
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                capabilities TEXT NOT NULL DEFAULT '[]',
                last_seen_at INTEGER NOT NULL
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_inbox ON inbox_messages(to_agent_id, read, created_at);
            CREATE INDEX IF NOT EXISTS idx_task_plan ON tasks(plan_id);
            CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_task_receiver ON tasks(receiver_agent_id);
            CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
            CREATE INDEX IF NOT EXISTS idx_artifacts_plan ON artifacts(plan_id);
            "#,
        )?;

        // Handle column additions for backward compatibility
        Self::migrate_add_columns(conn)?;
        Self::migrate_drop_columns(conn)?;

        Ok(())
    }

    /// Add new columns if they don't exist (for existing databases)
    fn migrate_add_columns(conn: &Connection) -> SqliteResult<()> {
        // Try to add current_run_id to tasks (may fail if already exists)
        let _ = conn.execute(
            "ALTER TABLE tasks ADD COLUMN current_run_id TEXT",
            [],
        );

        // Try to drop old columns from plans
        let _ = Self::migrate_drop_columns(conn);

        Ok(())
    }

    /// Drop deprecated columns (SQLite-specific approach)
    fn migrate_drop_columns(conn: &Connection) -> SqliteResult<()> {
        // Check if we need to migrate old schema
        let has_version = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('plans') WHERE name = 'version'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if has_version {
            // Need to recreate table without old columns
            conn.execute_batch(
                r#"
                -- Create new table without old columns
                CREATE TABLE IF NOT EXISTS plans_new (
                    id TEXT PRIMARY KEY,
                    publisher_agent_id TEXT NOT NULL,
                    reply_channel TEXT,
                    reply_to TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_approval',
                    content TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    approved_at INTEGER,
                    completed_at INTEGER
                );

                -- Copy data from old table
                INSERT INTO plans_new (id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at)
                SELECT id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at
                FROM plans;

                -- Drop old table and rename new one
                DROP TABLE IF EXISTS plans;
                ALTER TABLE plans_new RENAME TO plans;
                "#,
            )?;
        }

        Ok(())
    }

    // =============================================================================
    // Plan operations
    // =============================================================================

    pub fn create_plan(&self, plan: &Plan) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO plans (id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                &plan.id,
                &plan.publisher_agent_id,
                &plan.reply_channel,
                &plan.reply_to,
                Into::<&str>::into(plan.status),
                &plan.content,
                plan.created_at,
                plan.approved_at,
                plan.completed_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_plan(&self, plan_id: &str) -> anyhow::Result<Plan> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at
            FROM plans WHERE id = ?
            "#,
        )?;

        stmt.query_row(params![plan_id], |row| {
            let status_str: String = row.get(4)?;
            Ok(Plan {
                id: row.get(0)?,
                publisher_agent_id: row.get(1)?,
                reply_channel: row.get(2)?,
                reply_to: row.get(3)?,
                status: PlanStatus::try_from(status_str.as_str()).unwrap_or(PlanStatus::PendingApproval),
                content: row.get(5)?,
                created_at: row.get(6)?,
                approved_at: row.get(7)?,
                completed_at: row.get(8)?,
            })
        })
        .map_err(|e| anyhow::anyhow!("Failed to get plan: {}", e))
    }

    pub fn approve_plan(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            "UPDATE plans SET status = 'approved', approved_at = ? WHERE id = ?",
            params![now, plan_id],
        )?;
        Ok(())
    }

    pub fn cancel_plan(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE plans SET status = 'cancelled' WHERE id = ?",
            params![plan_id],
        )?;
        Ok(())
    }

    pub fn set_plan_executing(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE plans SET status = 'executing' WHERE id = ?",
            params![plan_id],
        )?;
        Ok(())
    }

    pub fn set_plan_completed(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            "UPDATE plans SET status = 'completed', completed_at = ? WHERE id = ?",
            params![now, plan_id],
        )?;
        Ok(())
    }

    pub fn set_plan_blocked(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE plans SET status = 'blocked' WHERE id = ?",
            params![plan_id],
        )?;
        Ok(())
    }

    pub fn update_plan_status(&self, plan_id: &str, status: PlanStatus) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE plans SET status = ? WHERE id = ?",
            params![Into::<&str>::into(status), plan_id],
        )?;
        Ok(())
    }

    pub fn get_plan_detail(&self, plan_id: &str) -> anyhow::Result<PlanDetail> {
        let plan = self.get_plan(plan_id)?;
        let tasks = self.get_tasks_by_plan(plan_id)?;
        let task_summaries: Vec<TaskSummary> = tasks.into_iter().map(|task| {
            let deps = self.get_task_dependencies(&task.id);
            TaskSummary {
                id: task.id.clone(),
                type_: task.type_,
                receiver_agent_id: task.receiver_agent_id,
                status: task.status,
                depends_on: deps.unwrap_or_default(),
                in_progress_at: task.in_progress_at,
                completed_at: task.completed_at,
                error: task.error,
            }
        }).collect();
        Ok(PlanDetail {
            plan,
            tasks: task_summaries,
        })
    }

    pub fn get_executing_plans(&self) -> anyhow::Result<Vec<Plan>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at
            FROM plans WHERE status = 'executing'
            "#,
        )?;

        let plans = stmt.query_map([], |row| {
            Ok(Plan {
                id: row.get(0)?,
                publisher_agent_id: row.get(1)?,
                reply_channel: row.get(2)?,
                reply_to: row.get(3)?,
                status: PlanStatus::try_from(row.get::<_, String>(4)?.as_str())
                    .unwrap_or(PlanStatus::PendingApproval),
                content: row.get(5)?,
                created_at: row.get(6)?,
                approved_at: row.get(7)?,
                completed_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get executing plans: {}", e))?;

        Ok(plans)
    }

    pub fn get_pending_approval_plans_older_than(&self, seconds: i64) -> anyhow::Result<Vec<Plan>> {
        let conn = self.conn.lock().unwrap();
        let cutoff = Utc::now().timestamp() - seconds;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, publisher_agent_id, reply_channel, reply_to, status, content, created_at, approved_at, completed_at
            FROM plans WHERE status = 'pending_approval' AND created_at < ?
            "#,
        )?;

        let plans = stmt.query_map(params![cutoff], |row| {
            Ok(Plan {
                id: row.get(0)?,
                publisher_agent_id: row.get(1)?,
                reply_channel: row.get(2)?,
                reply_to: row.get(3)?,
                status: PlanStatus::try_from(row.get::<_, String>(4)?.as_str())
                    .unwrap_or(PlanStatus::PendingApproval),
                content: row.get(5)?,
                created_at: row.get(6)?,
                approved_at: row.get(7)?,
                completed_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get pending approval plans: {}", e))?;

        Ok(plans)
    }

    // =============================================================================
    // Task operations
    // =============================================================================

    pub fn create_task(&self, task: &Task) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO tasks (id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                              priority, params, input_artifact_ids, result_schema, status,
                              current_run_id, retry_count, max_retries, timeout_seconds,
                              result, output_artifact_ids, error, created_at, in_progress_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
            "#,
            params![
                &task.id,
                &task.plan_id,
                task.plan_version,
                &task.publisher_agent_id,
                &task.receiver_agent_id,
                &task.type_,
                task.priority,
                &task.params,
                &task.input_artifact_ids,
                &task.result_schema,
                Into::<&str>::into(task.status),
                &task.current_run_id,
                task.retry_count,
                task.max_retries,
                task.timeout_seconds,
                &task.result,
                &task.output_artifact_ids,
                &task.error,
                task.created_at,
                task.in_progress_at,
                task.completed_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_task(&self, task_id: &str) -> anyhow::Result<Task> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                   priority, params, input_artifact_ids, result_schema, status,
                   current_run_id, retry_count, max_retries, timeout_seconds,
                   result, output_artifact_ids, error, created_at, in_progress_at, completed_at
            FROM tasks WHERE id = ?
            "#,
        )?;

        stmt.query_row(params![task_id], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str())
                    .unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        })
        .map_err(|e| anyhow::anyhow!("Failed to get task: {}", e))
    }

    pub fn update_task_status(&self, task_id: &str, status: TaskStatus) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "UPDATE tasks SET status = ? WHERE id = ?"
        )?;
        stmt.execute(params![Into::<&str>::into(status), task_id])?;
        Ok(())
    }

    pub fn update_task_run_id(&self, task_id: &str, run_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET current_run_id = ? WHERE id = ?",
            params![run_id, task_id],
        )?;
        Ok(())
    }

    pub fn mark_task_in_progress(&self, task_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            "UPDATE tasks SET status = 'in_progress', in_progress_at = ? WHERE id = ?",
            params![now, task_id],
        )?;
        Ok(())
    }

    pub fn mark_task_completed(&self, task_id: &str, result: &str, output_artifact_ids: Vec<String>) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        let artifacts_json = serde_json::to_string(&output_artifact_ids)?;
        conn.execute(
            r#"
            UPDATE tasks
            SET status = 'completed', result = ?, output_artifact_ids = ?, completed_at = ?, current_run_id = NULL
            WHERE id = ?
            "#,
            params![result, artifacts_json, now, task_id],
        )?;
        Ok(())
    }

    pub fn mark_task_failed(&self, task_id: &str, error: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            r#"
            UPDATE tasks SET status = 'failed', error = ?, completed_at = ?, current_run_id = NULL
            WHERE id = ?
            "#,
            params![error, now, task_id],
        )?;
        Ok(())
    }

    pub fn mark_task_blocked(&self, task_id: &str, error: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = 'blocked', error = ? WHERE id = ?",
            params![error, task_id],
        )?;
        Ok(())
    }

    pub fn increment_retry_and_reset(&self, task_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            UPDATE tasks
            SET retry_count = retry_count + 1, status = 'pending', current_run_id = NULL, in_progress_at = NULL, error = NULL
            WHERE id = ?
            "#,
            params![task_id],
        )?;
        Ok(())
    }

    pub fn reset_task_to_pending(&self, task_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = 'pending', current_run_id = NULL, in_progress_at = NULL WHERE id = ?",
            params![task_id],
        )?;
        Ok(())
    }

    pub fn cancel_tasks_for_plan(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = 'cancelled', current_run_id = NULL WHERE plan_id = ? AND status IN ('pending', 'in_progress')",
            params![plan_id],
        )?;
        Ok(())
    }

    pub fn get_tasks_by_plan(&self, plan_id: &str) -> anyhow::Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                   priority, params, input_artifact_ids, result_schema, status,
                   current_run_id, retry_count, max_retries, timeout_seconds,
                   result, output_artifact_ids, error, created_at, in_progress_at, completed_at
            FROM tasks WHERE plan_id = ?
            "#,
        )?;

        let tasks = stmt.query_map(params![plan_id], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str())
                    .unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get tasks by plan: {}", e))?;

        Ok(tasks)
    }

    pub fn get_ready_tasks(&self, plan_id: &str) -> Vec<Task> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare(
            r#"
            SELECT t.id, t.plan_id, t.plan_version, t.publisher_agent_id, t.receiver_agent_id, t.type,
                   t.priority, t.params, t.input_artifact_ids, t.result_schema, t.status,
                   t.current_run_id, t.retry_count, t.max_retries, t.timeout_seconds,
                   t.result, t.output_artifact_ids, t.error, t.created_at, t.in_progress_at, t.completed_at
            FROM tasks t
            WHERE t.plan_id = ?
              AND t.status = 'pending'
              AND NOT EXISTS (
                SELECT 1 FROM task_dependencies d
                JOIN tasks dep ON dep.id = d.depends_on_task_id
                WHERE d.task_id = t.id AND dep.status != 'completed'
              )
            ORDER BY t.priority DESC
            "#
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let tasks = stmt.query_map(params![plan_id], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str()).unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        });

        match tasks {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn get_in_progress_tasks(&self) -> anyhow::Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                   priority, params, input_artifact_ids, result_schema, status,
                   current_run_id, retry_count, max_retries, timeout_seconds,
                   result, output_artifact_ids, error, created_at, in_progress_at, completed_at
            FROM tasks WHERE status = 'in_progress'
            "#,
        )?;

        let tasks = stmt.query_map([], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str())
                    .unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get in_progress tasks: {}", e))?;

        Ok(tasks)
    }

    pub fn get_timed_out_tasks(&self) -> anyhow::Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                   priority, params, input_artifact_ids, result_schema, status,
                   current_run_id, retry_count, max_retries, timeout_seconds,
                   result, output_artifact_ids, error, created_at, in_progress_at, completed_at
            FROM tasks WHERE status = 'in_progress' AND in_progress_at > 0
            "#,
        )?;

        let tasks = stmt.query_map([], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str())
                    .unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get timed out tasks: {}", e))?;

        // Filter by timeout
        Ok(tasks.into_iter()
            .filter(|t| {
                if let Some(started) = t.in_progress_at {
                    now - started > t.timeout_seconds as i64
                } else {
                    false
                }
            })
            .collect())
    }

    pub fn get_tasks_by_agent(&self, agent_id: &str, page: i32, page_size: i32) -> anyhow::Result<(Vec<Task>, i64)> {
        let conn = self.conn.lock().unwrap();
        let offset = (page - 1) * page_size;

        // Get total count
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE receiver_agent_id = ?",
            params![agent_id],
            |row| row.get(0),
        )?;

        // Get tasks
        let mut stmt = conn.prepare(
            r#"
            SELECT id, plan_id, plan_version, publisher_agent_id, receiver_agent_id, type,
                   priority, params, input_artifact_ids, result_schema, status,
                   current_run_id, retry_count, max_retries, timeout_seconds,
                   result, output_artifact_ids, error, created_at, in_progress_at, completed_at
            FROM tasks WHERE receiver_agent_id = ?
            ORDER BY created_at DESC LIMIT ? OFFSET ?
            "#,
        )?;

        let tasks = stmt.query_map(params![agent_id, page_size, offset], |row| {
            let status_str: String = row.get(10)?;
            Ok(Task {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                plan_version: row.get(2)?,
                publisher_agent_id: row.get(3)?,
                receiver_agent_id: row.get(4)?,
                type_: row.get(5)?,
                priority: row.get(6)?,
                params: row.get(7)?,
                input_artifact_ids: row.get(8)?,
                result_schema: row.get(9)?,
                status: TaskStatus::try_from(status_str.as_str())
                    .unwrap_or(TaskStatus::Pending),
                current_run_id: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                timeout_seconds: row.get(14)?,
                result: row.get(15)?,
                output_artifact_ids: row.get(16)?,
                error: row.get(17)?,
                created_at: row.get(18)?,
                in_progress_at: row.get(19)?,
                completed_at: row.get(20)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get tasks by agent: {}", e))?;

        Ok((tasks, count))
    }

    pub fn get_task_dependencies(&self, task_id: &str) -> anyhow::Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?"
        )?;

        let deps = stmt.query_map(params![task_id], |row| {
            row.get::<_, String>(0)
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get task dependencies: {}", e))?;

        Ok(deps)
    }

    // =============================================================================
    // Task Dependency operations
    // =============================================================================

    pub fn create_dependency(&self, dep: &TaskDependency) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?1, ?2)",
            params![&dep.task_id, &dep.depends_on_task_id],
        )?;
        Ok(())
    }

    // =============================================================================
    // Inbox Message operations
    // =============================================================================

    pub fn create_inbox_message(&self, msg: &InboxMessage) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO inbox_messages (id, to_agent_id, from_agent_id, type, task_id, payload, read, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                &msg.id,
                &msg.to_agent_id,
                &msg.from_agent_id,
                Into::<&str>::into(msg.type_),
                &msg.task_id,
                &msg.payload,
                msg.read as i32,
                msg.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_inbox_messages(&self, agent_id: &str, unread_only: bool, limit: i32) -> anyhow::Result<Vec<InboxMessage>> {
        let conn = self.conn.lock().unwrap();
        let sql = if unread_only {
            "SELECT id, to_agent_id, from_agent_id, type, task_id, payload, read, created_at FROM inbox_messages WHERE to_agent_id = ? AND read = 0 ORDER BY created_at DESC LIMIT ?"
        } else {
            "SELECT id, to_agent_id, from_agent_id, type, task_id, payload, read, created_at FROM inbox_messages WHERE to_agent_id = ? ORDER BY created_at DESC LIMIT ?"
        };

        let mut stmt = conn.prepare(sql)?;
        let messages = stmt.query_map(params![agent_id, limit], |row| {
            let type_str: String = row.get(3)?;
            Ok(InboxMessage {
                id: row.get(0)?,
                to_agent_id: row.get(1)?,
                from_agent_id: row.get(2)?,
                type_: InboxMessageType::try_from(type_str.as_str()).unwrap_or(InboxMessageType::TaskStarted),
                task_id: row.get(4)?,
                payload: row.get(5)?,
                read: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get inbox messages: {}", e))?;

        Ok(messages)
    }

    pub fn mark_inbox_read(&self, msg_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE inbox_messages SET read = 1 WHERE id = ?",
            params![msg_id],
        )?;
        Ok(())
    }

    // =============================================================================
    // Artifact operations
    // =============================================================================

    pub fn create_artifact(&self, artifact: &Artifact) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO artifacts (id, owner_agent_id, task_id, plan_id, filename, file_path, mime_type, size_bytes, status, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                &artifact.id,
                &artifact.owner_agent_id,
                &artifact.task_id,
                &artifact.plan_id,
                &artifact.filename,
                &artifact.file_path,
                &artifact.mime_type,
                artifact.size_bytes,
                Into::<&str>::into(artifact.status),
                artifact.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_artifact(&self, artifact_id: &str) -> anyhow::Result<Artifact> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, owner_agent_id, task_id, plan_id, filename, file_path, mime_type, size_bytes, status, created_at
            FROM artifacts WHERE id = ?
            "#,
        )?;

        stmt.query_row(params![artifact_id], |row| {
            let status_str: String = row.get(8)?;
            Ok(Artifact {
                id: row.get(0)?,
                owner_agent_id: row.get(1)?,
                task_id: row.get(2)?,
                plan_id: row.get(3)?,
                filename: row.get(4)?,
                file_path: row.get(5)?,
                mime_type: row.get(6)?,
                size_bytes: row.get(7)?,
                status: ArtifactStatus::try_from(status_str.as_str()).unwrap_or(ArtifactStatus::Valid),
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| anyhow::anyhow!("Failed to get artifact: {}", e))
    }

    pub fn get_artifacts_by_task(&self, task_id: &str) -> anyhow::Result<Vec<Artifact>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, owner_agent_id, task_id, plan_id, filename, file_path, mime_type, size_bytes, status, created_at
            FROM artifacts WHERE task_id = ?
            "#,
        )?;

        let artifacts = stmt.query_map(params![task_id], |row| {
            let status_str: String = row.get(8)?;
            Ok(Artifact {
                id: row.get(0)?,
                owner_agent_id: row.get(1)?,
                task_id: row.get(2)?,
                plan_id: row.get(3)?,
                filename: row.get(4)?,
                file_path: row.get(5)?,
                mime_type: row.get(6)?,
                size_bytes: row.get(7)?,
                status: ArtifactStatus::try_from(status_str.as_str()).unwrap_or(ArtifactStatus::Valid),
                created_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get artifacts by task: {}", e))?;

        Ok(artifacts)
    }

    pub fn get_artifacts_by_ids(&self, artifact_ids: &[String]) -> anyhow::Result<Vec<Artifact>> {
        if artifact_ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap();
        let placeholders = artifact_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            r#"
            SELECT id, owner_agent_id, task_id, plan_id, filename, file_path, mime_type, size_bytes, status, created_at
            FROM artifacts WHERE id IN ({})
            "#,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let artifacts = stmt.query_map(
            artifact_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect::<Vec<_>>().as_slice(),
            |row| {
                let status_str: String = row.get(8)?;
                Ok(Artifact {
                    id: row.get(0)?,
                    owner_agent_id: row.get(1)?,
                    task_id: row.get(2)?,
                    plan_id: row.get(3)?,
                    filename: row.get(4)?,
                    file_path: row.get(5)?,
                    mime_type: row.get(6)?,
                    size_bytes: row.get(7)?,
                    status: ArtifactStatus::try_from(status_str.as_str()).unwrap_or(ArtifactStatus::Valid),
                    created_at: row.get(9)?,
                })
            }
        )?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to get artifacts by ids: {}", e))?;

        Ok(artifacts)
    }

    pub fn invalidate_artifacts_for_plan(&self, plan_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE artifacts SET status = 'invalidated' WHERE plan_id = ?",
            params![plan_id],
        )?;
        Ok(())
    }

    // =============================================================================
    // Agent operations
    // =============================================================================

    pub fn list_agents(&self) -> anyhow::Result<Vec<AgentInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, status, capabilities, last_seen_at
            FROM agents ORDER BY name
            "#,
        )?;

        let agents = stmt.query_map([], |row| {
            let status_str: String = row.get(2)?;
            Ok(AgentInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                status: AgentStatus::try_from(status_str.as_str()).unwrap_or(AgentStatus::Idle),
                capabilities: row.get(3)?,
                last_seen_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::anyhow!("Failed to list agents: {}", e))?;

        Ok(agents)
    }

    pub fn get_agent(&self, agent_id: &str) -> anyhow::Result<AgentInfo> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, status, capabilities, last_seen_at
            FROM agents WHERE id = ?
            "#,
        )?;

        stmt.query_row(params![agent_id], |row| {
            let status_str: String = row.get(2)?;
            Ok(AgentInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                status: AgentStatus::try_from(status_str.as_str()).unwrap_or(AgentStatus::Idle),
                capabilities: row.get(3)?,
                last_seen_at: row.get(4)?,
            })
        })
        .map_err(|e| anyhow::anyhow!("Failed to get agent: {}", e))
    }

    pub fn upsert_agent(&self, agent: &AgentInfo) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO agents (id, name, status, capabilities, last_seen_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                status = excluded.status,
                capabilities = excluded.capabilities,
                last_seen_at = excluded.last_seen_at
            "#,
            params![
                &agent.id,
                &agent.name,
                Into::<&str>::into(agent.status),
                &agent.capabilities,
                agent.last_seen_at,
            ],
        )?;
        Ok(())
    }

    pub fn mark_agent_offline(&self, agent_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE agents SET status = 'offline' WHERE id = ?",
            params![agent_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[test]
    fn test_create_and_get_plan() {
        let db = create_test_db();
        let plan = Plan::new(
            "test-plan".to_string(),
            "orchestrator".to_string(),
            Some("feishu".to_string()),
            Some("ou_test".to_string()),
            "Test plan content".to_string(),
        );

        db.create_plan(&plan).unwrap();
        let retrieved = db.get_plan("test-plan").unwrap();

        assert_eq!(retrieved.id, plan.id);
        assert_eq!(retrieved.publisher_agent_id, plan.publisher_agent_id);
        assert_eq!(retrieved.status, PlanStatus::PendingApproval);
    }

    #[test]
    fn test_approve_plan() {
        let db = create_test_db();
        let plan = Plan::new(
            "test-plan".to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );

        db.create_plan(&plan).unwrap();
        db.approve_plan("test-plan").unwrap();

        let retrieved = db.get_plan("test-plan").unwrap();
        assert_eq!(retrieved.status, PlanStatus::Approved);
        assert!(retrieved.approved_at.is_some());
    }

    #[test]
    fn test_create_and_get_task() {
        let db = create_test_db();

        let plan = Plan::new(
            "test-plan".to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        let task = Task::new(
            "test-task".to_string(),
            "test-plan".to_string(),
            1,
            "orchestrator".to_string(),
            "worker".to_string(),
            "test_type".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        );

        db.create_task(&task).unwrap();
        let retrieved = db.get_task("test-task").unwrap();

        assert_eq!(retrieved.id, task.id);
        assert_eq!(retrieved.plan_id, task.plan_id);
        assert_eq!(retrieved.receiver_agent_id, task.receiver_agent_id);
    }

    #[test]
    fn test_task_dependencies() {
        let db = create_test_db();

        let plan = Plan::new(
            "test-plan".to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        db.create_task(&Task::new(
            "t1".to_string(),
            "test-plan".to_string(),
            1,
            "orchestrator".to_string(),
            "worker".to_string(),
            "test_type".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        )).unwrap();

        db.create_task(&Task::new(
            "t2".to_string(),
            "test-plan".to_string(),
            1,
            "orchestrator".to_string(),
            "worker".to_string(),
            "test_type".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        )).unwrap();

        let dep = TaskDependency {
            task_id: "t2".to_string(),
            depends_on_task_id: "t1".to_string(),
        };
        db.create_dependency(&dep).unwrap();

        let deps = db.get_task_dependencies("t2").unwrap();
        assert_eq!(deps, vec!["t1"]);
    }

    #[test]
    fn test_get_ready_tasks() {
        let db = create_test_db();

        let plan = Plan::new(
            "test-plan".to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        // Create task with no dependencies
        db.create_task(&Task::new(
            "t1".to_string(),
            "test-plan".to_string(),
            1,
            "orchestrator".to_string(),
            "worker".to_string(),
            "test_type".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        )).unwrap();

        // Create task with dependency
        db.create_task(&Task::new(
            "t2".to_string(),
            "test-plan".to_string(),
            1,
            "orchestrator".to_string(),
            "worker".to_string(),
            "test_type".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        )).unwrap();

        let dep = TaskDependency {
            task_id: "t2".to_string(),
            depends_on_task_id: "t1".to_string(),
        };
        db.create_dependency(&dep).unwrap();

        let ready = db.get_ready_tasks("test-plan");
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "t1");
    }

    #[test]
    fn test_agent_upsert() {
        let db = create_test_db();

        let agent = AgentInfo::new(
            "agent-1".to_string(),
            "Test Agent".to_string(),
            vec!["test".to_string()],
        );

        db.upsert_agent(&agent).unwrap();
        let retrieved = db.get_agent("agent-1").unwrap();

        assert_eq!(retrieved.id, agent.id);
        assert_eq!(retrieved.name, agent.name);
        assert_eq!(retrieved.status, AgentStatus::Idle);
    }
}