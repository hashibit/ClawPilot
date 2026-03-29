//! Context builder for agent dispatch messages
//!
//! Builds the complete context message sent to OpenClaw agents.

use crate::scheduler::{Db, models::*};

/// Build the context message for an agent task
pub fn build_context(task: &Task, db: &Db) -> anyhow::Result<String> {
    // Get the plan
    let plan = db.get_plan(&task.plan_id)?;

    // Get input artifacts
    let input_artifact_ids: Vec<String> = serde_json::from_str(&task.input_artifact_ids).unwrap_or_default();
    let input_artifacts = db.get_artifacts_by_ids(&input_artifact_ids)?;

    let mut ctx = String::new();

    ctx.push_str("你正在执行一个任务。\n\n");

    // Task information
    ctx.push_str("## 任务信息\n");
    ctx.push_str(&format!("- 任务ID：{}\n", task.id));
    ctx.push_str(&format!("- 类型：{}\n", task.type_));
    ctx.push_str(&format!("- 参数：{}\n", task.params));

    // Background
    ctx.push_str("\n## 背景\n");
    ctx.push_str(&format!("- 所属计划：{}\n", plan.id));
    ctx.push_str(&format!("- 计划内容：{}\n", plan.content));

    // Calculate step information
    let all_tasks = db.get_tasks_by_plan(&task.plan_id)?;
    let total_steps = all_tasks.len();
    let step = all_tasks.iter().position(|t| t.id == task.id).map_or(1, |p| p + 1);
    ctx.push_str(&format!("- 当前是第 {} 步，共 {} 步\n", step, total_steps));

    // Input artifacts
    if !input_artifacts.is_empty() {
        ctx.push_str("\n## 输入材料\n");
        for art in input_artifacts {
            ctx.push_str(&format!("- {}：{}\n", art.filename, art.file_path));
        }
    }

    // Output requirements - use new artifact directory structure
    let output_dir = if let Some(run_id) = &task.current_run_id {
        format!("./artifacts/plans/{}/{}/{}", task.plan_id, task.receiver_agent_id, run_id)
    } else {
        format!("./artifacts/plans/{}/{}/<run_id>", task.plan_id, task.receiver_agent_id)
    };

    ctx.push_str("\n## 输出要求\n");
    ctx.push_str(&format!("- 产出文件写到：{}\n", output_dir));

    // Build result schema from the task's result_schema field
    let result_schema = if task.result_schema.is_empty() || task.result_schema == "{}" {
        "{}".to_string()
    } else {
        task.result_schema.clone()
    };

    ctx.push_str("- 完成后以如下 JSON 格式返回结果（仅返回 JSON，不要有其他内容）：\n");
    ctx.push_str(&format!(r#"{{"status": "done|failed", "error": "...", "data": {}}}"#, result_schema));
    ctx.push_str("\n\n");
    ctx.push_str("注意：status 为 \"done\" 时表示任务成功，data 字段应包含具体的任务结果；status 为 \"failed\" 时表示任务失败，error 字段应包含失败原因。");

    Ok(ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[test]
    fn test_build_context_basic() {
        let db = create_test_db();

        // Create a plan
        let plan = Plan::new(
            "plan-1".to_string(),
            "orchestrator".to_string(),
            Some("feishu".to_string()),
            Some("ou_test".to_string()),
            "Test plan to build a website".to_string(),
        );
        db.create_plan(&plan).unwrap();

        // Create a task
        let task = Task::new(
            "task-1".to_string(),
            "plan-1".to_string(),
            1,
            "orchestrator".to_string(),
            "worker-frontend".to_string(),
            "write_frontend".to_string(),
            0,
            r#"{"feature": "homepage"}"#.to_string(),
            r#"{"code": "string", "files": ["string"]}"#.to_string(),
            3600,
        );
        db.create_task(&task).unwrap();

        let context = build_context(&task, &db).unwrap();

        assert!(context.contains("你正在执行一个任务"));
        assert!(context.contains("任务ID：task-1"));
        assert!(context.contains("类型：write_frontend"));
        assert!(context.contains("所属计划：plan-1"));
        assert!(context.contains("第 1 步，共 1 步"));
        assert!(context.contains("./artifacts/plans/plan-1"));
        assert!(context.contains(r#"status": "done|failed""#));
    }

    #[test]
    fn test_build_context_with_input_artifacts() {
        let db = create_test_db();

        // Create a plan
        let plan = Plan::new(
            "plan-1".to_string(),
            "orchestrator".to_string(),
            None,
            None,
            "Test plan".to_string(),
        );
        db.create_plan(&plan).unwrap();

        // Create a task with input artifacts
        let mut task = Task::new(
            "task-2".to_string(),
            "plan-1".to_string(),
            1,
            "orchestrator".to_string(),
            "worker-backend".to_string(),
            "process_data".to_string(),
            0,
            "{}".to_string(),
            "{}".to_string(),
            3600,
        );
        task.input_artifact_ids = r#"["art-1", "art-2"]"#.to_string();
        db.create_task(&task).unwrap();

        // Create input artifacts
        let art1 = Artifact::new(
            "art-1".to_string(),
            "worker-frontend".to_string(),
            "task-1".to_string(),
            "plan-1".to_string(),
            "data.json".to_string(),
            "./artifacts/tasks/task-1/data.json".to_string(),
            1024,
        );
        db.create_artifact(&art1).unwrap();

        let art2 = Artifact::new(
            "art-2".to_string(),
            "worker-frontend".to_string(),
            "task-1".to_string(),
            "plan-1".to_string(),
            "config.json".to_string(),
            "./artifacts/tasks/task-1/config.json".to_string(),
            512,
        );
        db.create_artifact(&art2).unwrap();

        let context = build_context(&task, &db).unwrap();

        assert!(context.contains("输入材料"));
        assert!(context.contains("data.json"));
        assert!(context.contains("config.json"));
    }
}