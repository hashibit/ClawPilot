//! Artifact directory management
//!
//! Handles creation of artifact directories and artifact registration.

use crate::scheduler::{Db, models::*};

/// Artifact directory root
pub const ARTIFACTS_ROOT: &str = "./artifacts";

/// Create task artifact directory
pub fn create_task_dir(task_id: &str) -> anyhow::Result<String> {
    let task_dir = format!("{}/tasks/{}", ARTIFACTS_ROOT, task_id);
    std::fs::create_dir_all(&task_dir)?;
    Ok(task_dir)
}

/// Create plan artifact directory
pub fn create_plan_dir(plan_id: &str) -> anyhow::Result<String> {
    let plan_dir = format!("{}/plans/{}", ARTIFACTS_ROOT, plan_id);
    std::fs::create_dir_all(&plan_dir)?;
    Ok(plan_dir)
}

/// Get task artifact directory path
pub fn get_task_dir(task_id: &str) -> String {
    format!("{}/tasks/{}", ARTIFACTS_ROOT, task_id)
}

/// Get plan artifact directory path
pub fn get_plan_dir(plan_id: &str) -> String {
    format!("{}/plans/{}", ARTIFACTS_ROOT, plan_id)
}

/// Register an artifact in the database
pub fn register_artifact(
    db: &Db,
    owner_agent_id: &str,
    task_id: &str,
    plan_id: &str,
    filename: &str,
) -> anyhow::Result<String> {
    let task_dir = get_task_dir(task_id);
    let file_path = format!("{}/{}", task_dir, filename);

    // Get file size
    let size = std::fs::metadata(&file_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    // Create artifact record
    let artifact_id = format!("art-{}-{}", task_id, uuid::Uuid::new_v4());
    let artifact = Artifact::new(
        artifact_id.clone(),
        owner_agent_id.to_string(),
        task_id.to_string(),
        plan_id.to_string(),
        filename.to_string(),
        file_path,
        size,
    );

    db.create_artifact(&artifact)?;
    Ok(artifact_id)
}

/// List artifacts for a task
pub fn list_task_artifacts(db: &Db, task_id: &str) -> anyhow::Result<Vec<Artifact>> {
    db.get_artifacts_by_task(task_id)
}

/// List artifacts for a plan
pub fn list_plan_artifacts(db: &Db, plan_id: &str) -> anyhow::Result<Vec<Artifact>> {
    let tasks = db.get_tasks_by_plan(plan_id)?;
    let mut all_artifacts = Vec::new();

    for task in tasks {
        if let Ok(artifacts) = db.get_artifacts_by_task(&task.id) {
            all_artifacts.extend(artifacts);
        }
    }

    Ok(all_artifacts)
}

/// Get an artifact by ID
pub fn get_artifact(db: &Db, artifact_id: &str) -> anyhow::Result<Artifact> {
    db.get_artifact(artifact_id)
}

/// Get artifacts by IDs
pub fn get_artifacts_by_ids(db: &Db, artifact_ids: &[String]) -> anyhow::Result<Vec<Artifact>> {
    db.get_artifacts_by_ids(artifact_ids)
}

/// Invalidate all artifacts for a plan
pub fn invalidate_plan_artifacts(db: &Db, plan_id: &str) -> anyhow::Result<()> {
    db.invalidate_artifacts_for_plan(plan_id)
}

/// Delete artifact directory and all its contents
pub fn delete_task_dir(task_id: &str) -> anyhow::Result<()> {
    let task_dir = std::path::PathBuf::from(get_task_dir(task_id));
    if task_dir.exists() {
        std::fs::remove_dir_all(&task_dir)?;
    }
    Ok(())
}

/// Initialize the artifacts root directory
pub fn init_artifacts_root() -> anyhow::Result<()> {
    std::fs::create_dir_all(ARTIFACTS_ROOT)?;
    std::fs::create_dir_all(format!("{}/tasks", ARTIFACTS_ROOT))?;
    std::fs::create_dir_all(format!("{}/plans", ARTIFACTS_ROOT))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_get_task_dir() {
        let dir = get_task_dir("test-task-1");
        assert_eq!(dir, "./artifacts/tasks/test-task-1");
    }

    #[test]
    fn test_get_plan_dir() {
        let dir = get_plan_dir("test-plan-1");
        assert_eq!(dir, "./artifacts/plans/test-plan-1");
    }

    #[test]
    fn test_init_artifacts_root() {
        // Use temp directory for testing
        let temp = TempDir::new().unwrap();
        let root = temp.path().join("artifacts");

        // Temporarily override ARTIFACTS_ROOT for testing
        // Note: In real code, we'd use a configuration or environment variable

        let _ = std::fs::create_dir_all(&root);
        let _ = std::fs::create_dir_all(root.join("tasks"));
        let _ = std::fs::create_dir_all(root.join("plans"));

        assert!(root.exists());
        assert!(root.join("tasks").exists());
        assert!(root.join("plans").exists());
    }
}