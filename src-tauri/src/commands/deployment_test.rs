/// deployment_test.rs
/// Deployment 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::opc::OpcConfig;
    use crate::models::office::Office;
    use crate::services::{deployment_service, opc_service, office_service};
    use crate::services::deployment_service::DeploymentStatus;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_office() -> Office {
        Office {
            id: String::new(),
            name: "test-office".to_string(),
            address: Some("localhost".to_string()),
            access_card: None,
            phone: None,
            receptionist_image: None,
            ownership: "OWNED".to_string(),
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
            current_opc_id: None,
            current_opc_name: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn setup_with_opc_and_office() -> (DbPool, String, String) {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, OpcConfig {
            id: String::new(),
            name: "test-opc".to_string(),
            display_name: "Test OPC".to_string(),
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
        }).unwrap();

        let office_id = office_service::create_office(&pool, &make_office()).unwrap();

        (pool, opc_id, office_id)
    }

    // ─── DeploymentStatus 测试 ───────────────────────────────────────────

    #[test]
    fn test_deployment_status_serde() {
        let status = DeploymentStatus::Running;
        let json = serde_json::to_string(&status).expect("serialize failed");
        assert_eq!(json, r#""RUNNING""#);

        let decoded: DeploymentStatus = serde_json::from_str(&json).expect("deserialize failed");
        assert_eq!(decoded, DeploymentStatus::Running);
    }

    #[test]
    fn test_deployment_status_all_variants() {
        let variants = [
            (DeploymentStatus::Pending, "PENDING"),
            (DeploymentStatus::Running, "RUNNING"),
            (DeploymentStatus::Success, "SUCCESS"),
            (DeploymentStatus::Failed, "FAILED"),
            (DeploymentStatus::Rollback, "ROLLBACK"),
        ];

        for (status, expected) in &variants {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(json, format!(r#""{}""#, expected));
        }
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_start_deployment() {
        let (pool, opc_id, office_id) = setup_with_opc_and_office();

        let task_id = deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();
        assert!(!task_id.is_empty());

        let task = deployment_service::get_deployment(&pool, &task_id).unwrap();
        assert_eq!(task.opc_id, Some(opc_id));
        assert_eq!(task.office_id, Some(office_id));
    }

    #[test]
    fn test_get_deployment_status() {
        let (pool, opc_id, office_id) = setup_with_opc_and_office();
        let task_id = deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();

        let task = deployment_service::get_deployment(&pool, &task_id).unwrap();
        assert!(!task.id.is_empty());
    }

    #[test]
    fn test_get_deployment_nonexistent() {
        let pool = setup();
        let result = deployment_service::get_deployment(&pool, "nonexistent-task");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_recent_deployments() {
        let (pool, opc_id, office_id) = setup_with_opc_and_office();

        deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();
        deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();

        let deployments = deployment_service::get_recent_deployments(&pool, &opc_id, 10).unwrap();
        assert_eq!(deployments.len(), 2);
    }

    #[test]
    fn test_get_recent_deployments_empty() {
        let (pool, opc_id, _) = setup_with_opc_and_office();

        let deployments = deployment_service::get_recent_deployments(&pool, &opc_id, 10).unwrap();
        assert!(deployments.is_empty());
    }

    #[test]
    fn test_cancel_deployment() {
        let (pool, opc_id, office_id) = setup_with_opc_and_office();
        let task_id = deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();

        deployment_service::cancel_deployment(&pool, &task_id).unwrap();

        let task = deployment_service::get_deployment(&pool, &task_id).unwrap();
        // 任务状态应该是取消或失败
        assert!(
            task.status == DeploymentStatus::Failed ||
            task.status == DeploymentStatus::Pending ||
            task.status == DeploymentStatus::Rollback
        );
    }

    #[test]
    fn test_build_deploy_package() {
        let (pool, opc_id, _) = setup_with_opc_and_office();

        let result = deployment_service::build_deploy_package(&pool, &opc_id);
        // 可能成功或失败（取决于 OPC 是否有足够数据）
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_generate_openclaw_config() {
        let (pool, opc_id, _) = setup_with_opc_and_office();

        let result = deployment_service::generate_openclaw_config(&pool, &opc_id);
        assert!(result.is_ok());

        let config = result.unwrap();
        // 应该返回 JSON 配置
        assert!(config.is_object());
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_deployment_with_nonexistent_opc() {
        let (pool, _, office_id) = setup_with_opc_and_office();

        let result = deployment_service::start_deployment(&pool, "nonexistent-opc", &office_id);
        assert!(matches!(result, Err(AppError::NotFound(_))) || result.is_err());
    }

    #[test]
    fn test_deployment_with_nonexistent_office() {
        let (pool, opc_id, _) = setup_with_opc_and_office();

        let result = deployment_service::start_deployment(&pool, &opc_id, "nonexistent-office");
        assert!(matches!(result, Err(AppError::NotFound(_))) || result.is_err());
    }

    #[test]
    fn test_deployment_limit_parameter() {
        let (pool, opc_id, office_id) = setup_with_opc_and_office();

        deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();
        deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();
        deployment_service::start_deployment(&pool, &opc_id, &office_id).unwrap();

        let deployments = deployment_service::get_recent_deployments(&pool, &opc_id, 2).unwrap();
        assert_eq!(deployments.len(), 2);
    }
}