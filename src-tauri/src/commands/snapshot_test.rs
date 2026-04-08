/// snapshot_test.rs
/// Snapshot 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::services::{snapshot_service, opc_service};
    use crate::models::opc::OpcConfig;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn setup_with_opc() -> (DbPool, String) {
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

        (pool, opc_id)
    }

    fn make_config_data() -> String {
        serde_json::json!({
            "agents": [],
            "channels": [],
            "bindings": []
        }).to_string()
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_snapshot() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "Test Snapshot", &config_data, false).unwrap();
        assert!(!id.is_empty());

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_name).unwrap();
        assert!(snapshots.iter().any(|s| s.id == id));
    }

    #[test]
    fn test_get_snapshot_by_id() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "Single Snapshot", &config_data, false).unwrap();

        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert_eq!(snapshot.label, "Single Snapshot");
        assert_eq!(snapshot.opc_name, opc_name);
    }

    #[test]
    fn test_create_auto_snapshot() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "Auto Snapshot", &config_data, true).unwrap();

        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert!(snapshot.is_auto);
    }

    #[test]
    fn test_delete_snapshot() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "To Delete", &config_data, false).unwrap();

        snapshot_service::delete_snapshot(&pool, &id).unwrap();

        let result = snapshot_service::get_snapshot(&pool, &id);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_nonexistent_snapshot() {
        let pool = setup();
        let result = snapshot_service::delete_snapshot(&pool, "nonexistent-id");
        assert!(result.is_ok() || matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_snapshot_nonexistent() {
        let pool = setup();
        let result = snapshot_service::get_snapshot(&pool, "nonexistent-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_snapshots_empty_for_opc() {
        let (pool, opc_name) = setup_with_opc();

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_name).unwrap();
        assert!(snapshots.is_empty());
    }

    #[test]
    fn test_multiple_snapshots_for_opc() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        snapshot_service::create_snapshot(&pool, &opc_name, "Snap 1", &config_data, false).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_name, "Snap 2", &config_data, true).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_name, "Snap 3", &config_data, false).unwrap();

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_name).unwrap();
        assert_eq!(snapshots.len(), 3);
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_snapshot_with_empty_label() {
        let (pool, opc_name) = setup_with_opc();
        let config_data = make_config_data();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "", &config_data, false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert!(snapshot.label.is_empty());
    }

    #[test]
    fn test_snapshot_with_large_config_data() {
        let (pool, opc_name) = setup_with_opc();
        let large_config = "x".repeat(100000);

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "Large Config", &large_config, false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert!(snapshot.config_data.len() > 90000);
    }

    #[test]
    fn test_snapshot_with_json_config() {
        let (pool, opc_name) = setup_with_opc();
        let json_config = serde_json::json!({
            "agents": [
                {"id": "agent-1", "name": "Alice"},
                {"id": "agent-2", "name": "Bob"}
            ],
            "channels": [
                {"id": "ch-1", "type": "FEISHU"}
            ]
        }).to_string();

        let id = snapshot_service::create_snapshot(&pool, &opc_name, "JSON Config", &json_config, false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();

        // 验证可以解析回 JSON
        let parsed: serde_json::Value = serde_json::from_str(&snapshot.config_data).unwrap();
        assert_eq!(parsed["agents"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_snapshot_opc_isolation() {
        let pool = setup();

        let opc_a = opc_service::create_opc(&pool, OpcConfig {
            id: String::new(),
            name: "opc-a".to_string(),
            display_name: "OPC A".to_string(),
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

        let opc_b = opc_service::create_opc(&pool, OpcConfig {
            id: String::new(),
            name: "opc-b".to_string(),
            display_name: "OPC B".to_string(),
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

        let config_data = make_config_data();

        snapshot_service::create_snapshot(&pool, &opc_a, "Snap A", &config_data, false).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_b, "Snap B", &config_data, false).unwrap();

        let snaps_a = snapshot_service::get_snapshots(&pool, &opc_a).unwrap();
        let snaps_b = snapshot_service::get_snapshots(&pool, &opc_b).unwrap();

        assert_eq!(snaps_a.len(), 1);
        assert_eq!(snaps_b.len(), 1);
        assert_eq!(snaps_a[0].label, "Snap A");
        assert_eq!(snaps_b[0].label, "Snap B");
    }
}