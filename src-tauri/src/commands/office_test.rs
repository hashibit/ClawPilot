/// office_test.rs
/// Office 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::office::{Office, OfficeDeployment, DaemonHealthResult};
    use crate::services::office_service;

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
            daemon_api_key: None,
            opc_root: None,
            initial_openclaw_config: None,
            current_opc_id: None,
            current_opc_name: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_office_serde_roundtrip() {
        let office = Office {
            id: "office-001".to_string(),
            name: "Test Office".to_string(),
            address: Some("192.168.1.100".to_string()),
            access_card: None,
            phone: Some("1234567890".to_string()),
            receptionist_image: None,
            ownership: "RENTED".to_string(),
            monthly_rent: Some(1000.0),
            internet_speed: Some("100Mbps".to_string()),
            decoration_grade: "HIGH".to_string(),
            description: Some("A test office".to_string()),
            access_auth_type: Some("ssh_key".to_string()),
            access_user: Some("admin".to_string()),
            access_password: None,
            ssh_key_path: Some("/home/user/.ssh/id_rsa".to_string()),
            daemon_url: Some("http://localhost:16668".to_string()),
            daemon_api_key: Some("test-key".to_string()),
            opc_root: None,
            initial_openclaw_config: None,
            current_opc_id: None,
            current_opc_name: None,
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&office).expect("serialize failed");
        let decoded: Office = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, office.id);
        assert_eq!(decoded.name, office.name);
        assert_eq!(decoded.ownership, "RENTED");
    }

    #[test]
    fn test_office_with_minimal_fields() {
        let json = r#"{
            "name": "Minimal Office",
            "ownership": "OWNED",
            "decoration_grade": "LOW"
        }"#;

        let decoded: Office = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.name, "Minimal Office");
        assert!(decoded.address.is_none());
        assert_eq!(decoded.ownership, "OWNED");
    }

    #[test]
    fn test_daemon_health_result_serde() {
        let result = DaemonHealthResult {
            ok: true,
            error: None,
            not_installed: Some(false),
            status: Some("running".to_string()),
            version: Some("1.0.0".to_string()),
            openclaw_status: Some("running".to_string()),
            openclaw_pid: Some(12345),
            active_tasks: Some(5),
        };

        let json = serde_json::to_string(&result).expect("serialize failed");
        let decoded: DaemonHealthResult = serde_json::from_str(&json).expect("deserialize failed");

        assert!(decoded.ok);
        assert_eq!(decoded.version, Some("1.0.0".to_string()));
    }

    #[test]
    fn test_daemon_health_result_error() {
        let json = r#"{
            "ok": false,
            "error": "Connection refused",
            "not_installed": true
        }"#;

        let decoded: DaemonHealthResult = serde_json::from_str(json).expect("deserialize failed");
        assert!(!decoded.ok);
        assert_eq!(decoded.error, Some("Connection refused".to_string()));
        assert_eq!(decoded.not_installed, Some(true));
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_office() {
        let pool = setup();
        let office = make_office("test-office");

        let id = office_service::create_office(&pool, &office).unwrap();
        assert!(!id.is_empty());

        let retrieved = office_service::get_office(&pool, &id).unwrap();
        assert_eq!(retrieved.name, "test-office");
    }

    #[test]
    fn test_get_offices() {
        let pool = setup();

        office_service::create_office(&pool, &make_office("office-1")).unwrap();
        office_service::create_office(&pool, &make_office("office-2")).unwrap();

        let offices = office_service::get_offices(&pool).unwrap();
        assert_eq!(offices.len(), 2);
    }

    #[test]
    fn test_update_office() {
        let pool = setup();
        let office = make_office("original");
        let id = office_service::create_office(&pool, &office).unwrap();

        let mut updated = office_service::get_office(&pool, &id).unwrap();
        updated.name = "updated".to_string();
        updated.address = Some("192.168.1.200".to_string());

        office_service::update_office(&pool, &id, &updated).unwrap();

        let retrieved = office_service::get_office(&pool, &id).unwrap();
        assert_eq!(retrieved.name, "updated");
        assert_eq!(retrieved.address, Some("192.168.1.200".to_string()));
    }

    #[test]
    fn test_delete_office() {
        let pool = setup();
        let office = make_office("to-delete");
        let id = office_service::create_office(&pool, &office).unwrap();

        office_service::delete_office(&pool, &id).unwrap();

        let result = office_service::get_office(&pool, &id);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_office_nonexistent() {
        let pool = setup();
        let result = office_service::get_office(&pool, "nonexistent-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_office_with_empty_name() {
        let pool = setup();
        let office = Office {
            name: String::new(),
            ..make_office("temp")
        };

        let result = office_service::create_office(&pool, &office);
        assert!(result.is_ok() || matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn test_office_with_special_characters() {
        let pool = setup();
        let office = Office {
            name: "办公室-测试-🔐".to_string(),
            ..make_office("temp")
        };

        let id = office_service::create_office(&pool, &office).unwrap();
        let retrieved = office_service::get_office(&pool, &id).unwrap();
        assert_eq!(retrieved.name, "办公室-测试-🔐");
    }

    #[test]
    fn test_office_with_remote_address() {
        let pool = setup();
        let office = Office {
            address: Some("remote.example.com:22".to_string()),
            access_auth_type: Some("ssh_key".to_string()),
            access_user: Some("deploy".to_string()),
            ssh_key_path: Some("/keys/deploy.key".to_string()),
            ..make_office("remote-office")
        };

        let id = office_service::create_office(&pool, &office).unwrap();
        let retrieved = office_service::get_office(&pool, &id).unwrap();
        assert_eq!(retrieved.address, Some("remote.example.com:22".to_string()));
        assert_eq!(retrieved.access_auth_type, Some("ssh_key".to_string()));
    }

    #[test]
    fn test_office_with_daemon_config() {
        let pool = setup();
        let office = Office {
            daemon_url: Some("http://192.168.1.100:16668".to_string()),
            daemon_api_key: Some("sk-daemon-test".to_string()),
            ..make_office("daemon-office")
        };

        let id = office_service::create_office(&pool, &office).unwrap();
        let retrieved = office_service::get_office(&pool, &id).unwrap();
        assert_eq!(retrieved.daemon_url, Some("http://192.168.1.100:16668".to_string()));
    }
}