pub mod config;
pub mod crud;
pub mod execute;
pub mod types;

pub use self::config::{generate_openclaw_config, generate_opc_config};
pub use self::crud::{
    cancel_deployment, get_deployment, get_office_deployments, get_recent_deployments,
    start_deployment,
};
pub use self::execute::{build_deploy_package, deploy_to_office, undeploy};
pub use self::types::{DeploymentStatus, DeploymentTask};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use crate::models::office::Office;
    use crate::models::opc::OpcConfig;
    use crate::services::{office, opc_service};
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_opc(name: &str) -> OpcConfig {
        OpcConfig {
            id: String::new(),
            name: name.to_string(),
            display_name: name.to_string(),
            description: None,
            avatar_color: None,
            avatar_initials: None,
            is_active: false,
            is_running: false,
            agent_count: 0,
            channel_count: 0,
            message_count_today: 0,
            message_growth: 0.0,
            created_at: 0,
            updated_at: 0,
            office_id: None,
            office_name: None,
        }
    }

    fn make_office(name: &str) -> Office {
        Office {
            id: String::new(),
            name: name.to_string(),
            address: Some("127.0.0.1".to_string()),
            access_card: None,
            phone: None,
            receptionist_image: None,
            ownership: "RENTED".to_string(),
            monthly_rent: None,
            internet_speed: None,
            decoration_grade: "MEDIUM".to_string(),
            description: None,
            access_auth_type: None,
            access_user: None,
            access_password: None,
            ssh_key_path: None,
            daemon_url: None,
            opc_root: None,
            initial_openclaw_config: None,
            openclaw_version: None,
            openclaw_install_path: None,
            openclaw_download_url: None,
            openclaw_nodejs_path: None,
            openclaw_nodejs_version: None,
            openclaw_installed_at: None,
            created_at: 0,
            updated_at: 0,
            current_opc_id: None,
            current_opc_name: None,
        }
    }

    // --- DeploymentStatus 测试 ---
    #[test]
    fn test_deployment_status_as_str() {
        assert_eq!(DeploymentStatus::Pending.as_str(), "PENDING");
        assert_eq!(DeploymentStatus::Running.as_str(), "RUNNING");
        assert_eq!(DeploymentStatus::Success.as_str(), "SUCCESS");
        assert_eq!(DeploymentStatus::Failed.as_str(), "FAILED");
        assert_eq!(DeploymentStatus::Rollback.as_str(), "ROLLBACK");
    }

    #[test]
    fn test_deployment_status_from_str() {
        assert!(matches!(
            DeploymentStatus::from_str("PENDING"),
            DeploymentStatus::Pending
        ));
        assert!(matches!(
            DeploymentStatus::from_str("RUNNING"),
            DeploymentStatus::Running
        ));
        assert!(matches!(
            DeploymentStatus::from_str("SUCCESS"),
            DeploymentStatus::Success
        ));
        assert!(matches!(
            DeploymentStatus::from_str("FAILED"),
            DeploymentStatus::Failed
        ));
        assert!(matches!(
            DeploymentStatus::from_str("ROLLBACK"),
            DeploymentStatus::Rollback
        ));
        assert!(matches!(
            DeploymentStatus::from_str("UNKNOWN"),
            DeploymentStatus::Pending
        ));
    }

    #[test]
    fn test_deployment_status_serde_roundtrip() {
        let statuses = vec![
            DeploymentStatus::Pending,
            DeploymentStatus::Running,
            DeploymentStatus::Success,
            DeploymentStatus::Failed,
            DeploymentStatus::Rollback,
        ];

        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let parsed: DeploymentStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(status, parsed);
        }
    }

    // --- start_deployment 测试 ---
    #[test]
    fn test_start_deployment_creates_task() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();

        let result = start_deployment(&pool, &opc_id, &office_id);
        assert!(result.is_ok());

        let task_id = result.unwrap();
        assert!(!task_id.is_empty());
    }

    #[test]
    fn test_start_deployment_fails_for_nonexistent_opc() {
        let pool = setup();

        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();

        let result = start_deployment(&pool, "nonexistent-opc", &office_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_start_deployment_fails_for_nonexistent_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = start_deployment(&pool, &opc_id, "nonexistent-office");
        assert!(result.is_err());
    }

    // --- get_deployment 测试 ---
    #[test]
    fn test_get_deployment() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();
        let task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();

        std::thread::sleep(std::time::Duration::from_millis(100));

        let result = get_deployment(&pool, &task_id);
        assert!(result.is_ok());

        let task = result.unwrap();
        assert_eq!(task.id, task_id);
        assert_eq!(task.opc_name, "test-opc");
    }

    #[test]
    fn test_get_deployment_not_found() {
        let pool = setup();

        let result = get_deployment(&pool, "nonexistent-task");
        assert!(result.is_err());
    }

    // --- cancel_deployment 测试 ---
    #[test]
    fn test_cancel_deployment() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();
        let task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();

        let result = cancel_deployment(&pool, &task_id);
        assert!(result.is_ok());

        let task = get_deployment(&pool, &task_id).unwrap();
        assert!(matches!(task.status, DeploymentStatus::Failed));
        assert_eq!(task.message, Some("已取消".to_string()));
    }

    // --- undeploy 测试 ---
    #[tokio::test]
    async fn test_undeploy() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();

        let _task_id = start_deployment(&pool, &opc_id, &office_id).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2500));

        let result = undeploy(&pool, &opc_id).await;
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert!(!opc.is_running);
    }

    // --- get_recent_deployments 测试 ---
    #[test]
    fn test_get_recent_deployments_empty() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = get_recent_deployments(&pool, &opc_id, 5);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_get_recent_deployments_returns_tasks() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = office::create_office(&pool, &make_office("test-office")).unwrap();

        start_deployment(&pool, &opc_id, &office_id).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));

        let result = get_recent_deployments(&pool, &opc_id, 5);
        assert!(result.is_ok());

        let deployments = result.unwrap();
        assert!(!deployments.is_empty());
    }

    // --- generate_openclaw_config 测试 ---
    #[test]
    fn test_generate_openclaw_config_fails_for_nonexistent_opc() {
        let pool = setup();

        let result = generate_openclaw_config(&pool, "nonexistent-opc");
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_openclaw_config_returns_json() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        let result = generate_openclaw_config(&pool, &opc_id);
        if let Err(ref e) = result {
            eprintln!("ERROR: {:?}", e);
        }
        assert!(result.is_ok(), "generate_openclaw_config should succeed");

        let config = result.unwrap();
        assert!(config.is_object());
        assert!(config.get("agents").is_some());
    }

    // --- DeploymentTask 结构测试 ---
    #[test]
    fn test_deployment_task_serde() {
        let task = DeploymentTask {
            id: "task-123".to_string(),
            opc_id: Some("opc-456".to_string()),
            opc_name: "Test OPC".to_string(),
            office_id: Some("office-789".to_string()),
            office_name: Some("Test Office".to_string()),
            status: DeploymentStatus::Running,
            message: Some("Deploying...".to_string()),
            steps: r#"["Step 1","Step 2"]"#.to_string(),
            current_step: 1,
            created_at: 1000,
            started_at: Some(1001),
            completed_at: None,
        };

        let json = serde_json::to_string(&task).unwrap();
        let parsed: DeploymentTask = serde_json::from_str(&json).unwrap();

        assert_eq!(task.id, parsed.id);
        assert_eq!(task.opc_name, parsed.opc_name);
        assert_eq!(task.current_step, parsed.current_step);
    }
}
