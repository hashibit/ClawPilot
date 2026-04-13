pub mod crud;
pub mod health;

pub use self::crud::{
    assign_office, create_office, delete_office, get_current_opc_name, get_local_daemon_version,
    get_office, get_office_deployments, get_offices, get_opc_office, update_office,
    update_office_daemon_config_by_id, update_office_daemon_url, update_office_openclaw_info,
};
pub use self::health::{
    check_daemon_health, probe_local_daemon, probe_remote_daemon, ProbeDaemonResult,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, pool::DbPool};
    use crate::models::office::{DaemonHealthResult, Office};
    use crate::models::opc::OpcConfig;
    use crate::services::opc_service;
    use rusqlite::Connection;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
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

    // --- CRUD 测试 ---
    #[test]
    fn test_create_office() {
        let pool = setup();
        let office = make_office("test-office");

        let result = create_office(&pool, &office);
        assert!(result.is_ok());

        let id = result.unwrap();
        assert!(!id.is_empty());
    }

    #[test]
    fn test_get_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = get_office(&pool, &id);
        assert!(result.is_ok());

        let fetched = result.unwrap();
        assert_eq!(fetched.id, id);
        assert_eq!(fetched.name, "test-office");
    }

    #[test]
    fn test_get_office_not_found() {
        let pool = setup();

        let result = get_office(&pool, "nonexistent-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_offices() {
        let pool = setup();

        create_office(&pool, &make_office("office-1")).unwrap();
        create_office(&pool, &make_office("office-2")).unwrap();

        let result = get_offices(&pool);
        assert!(result.is_ok());

        let offices = result.unwrap();
        assert_eq!(offices.len(), 2);
    }

    #[test]
    fn test_get_offices_empty() {
        let pool = setup();

        let result = get_offices(&pool);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_update_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("original")).unwrap();

        let mut updated = make_office("updated");
        updated.address = Some("192.168.1.1".to_string());

        let result = update_office(&pool, &id, &updated);
        assert!(result.is_ok());

        let fetched = get_office(&pool, &id).unwrap();
        assert_eq!(fetched.name, "updated");
        assert_eq!(fetched.address, Some("192.168.1.1".to_string()));
    }

    #[test]
    fn test_update_office_not_found() {
        let pool = setup();

        let result = update_office(&pool, "nonexistent", &make_office("test"));
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_office() {
        let pool = setup();
        let id = create_office(&pool, &make_office("to-delete")).unwrap();

        let result = delete_office(&pool, &id);
        assert!(result.is_ok());

        let fetch_result = get_office(&pool, &id);
        assert!(fetch_result.is_err());
    }

    // --- Office-OPC 关联测试 ---
    #[test]
    fn test_assign_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = assign_office(&pool, &opc_id, Some(&office_id));
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert_eq!(opc.office_id, Some(office_id));
    }

    #[test]
    fn test_unassign_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        assign_office(&pool, &opc_id, Some(&office_id)).unwrap();

        let result = assign_office(&pool, &opc_id, None);
        assert!(result.is_ok());

        let opc = opc_service::get_opc(&pool, &opc_id).unwrap();
        assert!(opc.office_id.is_none());
    }

    #[test]
    fn test_get_opc_office() {
        let pool = setup();

        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        // 未分配时返回 None
        let result = get_opc_office(&pool, &opc_id);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());

        // 分配后返回 Office
        assign_office(&pool, &opc_id, Some(&office_id)).unwrap();
        let result = get_opc_office(&pool, &opc_id);
        assert!(result.is_ok());
        let office = result.unwrap();
        assert!(office.is_some());
        assert_eq!(office.unwrap().id, office_id);
    }

    #[test]
    fn test_get_opc_office_opc_not_found() {
        let pool = setup();

        let result = get_opc_office(&pool, "nonexistent-opc");
        assert!(result.is_err());
    }

    // --- DaemonHealthResult 测试 ---
    #[test]
    fn test_daemon_health_result_default() {
        let result = DaemonHealthResult::default();
        assert!(!result.ok);
        assert!(result.error.is_none());
        assert!(result.status.is_none());
        assert!(result.version.is_none());
    }

    #[test]
    fn test_daemon_health_result_serde() {
        let result = DaemonHealthResult {
            ok: true,
            status: Some("ok".to_string()),
            version: Some("0.1.0".to_string()),
            openclaw_status: Some("running".to_string()),
            openclaw_pid: Some(12345),
            active_tasks: Some(2),
            ..Default::default()
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: DaemonHealthResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.status, parsed.status);
        assert_eq!(result.version, parsed.version);
    }

    // --- check_daemon_health 测试 ---
    #[tokio::test]
    async fn test_check_daemon_health_empty_url() {
        let result = check_daemon_health("", None).await;
        assert!(!result.ok);
        assert!(result.error.unwrap().contains("未配置"));
    }

    // --- get_office_deployments 测试 ---
    #[test]
    fn test_get_office_deployments_empty() {
        let pool = setup();
        let office_id = create_office(&pool, &make_office("test-office")).unwrap();

        let result = get_office_deployments(&pool, &office_id, 5);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // --- ProbeDaemonResult 测试 ---
    #[test]
    fn test_probe_daemon_result_serde() {
        let result = ProbeDaemonResult {
            ok: true,
            daemon_url: Some("http://127.0.0.1:16668".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: ProbeDaemonResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.ok, parsed.ok);
        assert_eq!(result.daemon_url, parsed.daemon_url);
    }
}
