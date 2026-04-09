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

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_snapshot() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "Test Snapshot", false).unwrap();
        assert!(!id.is_empty());

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_id).unwrap();
        assert!(snapshots.iter().any(|s| s.id == id));
    }

    #[test]
    fn test_get_snapshot_by_id() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "Single Snapshot", false).unwrap();

        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert_eq!(snapshot.label, "Single Snapshot");
        assert_eq!(snapshot.opc_name, "test-opc");
    }

    #[test]
    fn test_create_auto_snapshot() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "Auto Snapshot", true).unwrap();

        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert!(snapshot.is_auto);
    }

    #[test]
    fn test_delete_snapshot() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "To Delete", false).unwrap();

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
        let (pool, opc_id) = setup_with_opc();

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_id).unwrap();
        assert!(snapshots.is_empty());
    }

    #[test]
    fn test_multiple_snapshots_for_opc() {
        let (pool, opc_id) = setup_with_opc();

        snapshot_service::create_snapshot(&pool, &opc_id, "Snap 1", false).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_id, "Snap 2", true).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_id, "Snap 3", false).unwrap();

        let snapshots = snapshot_service::get_snapshots(&pool, &opc_id).unwrap();
        assert_eq!(snapshots.len(), 3);
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_snapshot_with_empty_label() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "", false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();
        assert!(snapshot.label.is_empty());
    }

    #[test]
    fn test_snapshot_config_data_is_generated() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "Generated Config", false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();

        // config_data should be generated JSON
        let parsed: serde_json::Value = serde_json::from_str(&snapshot.config_data).unwrap();
        assert!(parsed["agents"].is_array());
        assert!(parsed["channels"].is_array());
        assert!(parsed["bindings"].is_array());
    }

    #[test]
    fn test_snapshot_summary() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "With Summary", false).unwrap();
        let snapshot = snapshot_service::get_snapshot(&pool, &id).unwrap();

        // Summary should be calculated
        assert_eq!(snapshot.summary.agent_count, 0);
        assert_eq!(snapshot.summary.channel_count, 0);
        assert_eq!(snapshot.summary.binding_count, 0);
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

        snapshot_service::create_snapshot(&pool, &opc_a, "Snap A", false).unwrap();
        snapshot_service::create_snapshot(&pool, &opc_b, "Snap B", false).unwrap();

        let snaps_a = snapshot_service::get_snapshots(&pool, &opc_a).unwrap();
        let snaps_b = snapshot_service::get_snapshots(&pool, &opc_b).unwrap();

        assert_eq!(snaps_a.len(), 1);
        assert_eq!(snaps_b.len(), 1);
        assert_eq!(snaps_a[0].label, "Snap A");
        assert_eq!(snaps_b[0].label, "Snap B");
    }

    #[test]
    fn test_restore_snapshot_returns_opc_id() {
        let (pool, opc_id) = setup_with_opc();

        let id = snapshot_service::create_snapshot(&pool, &opc_id, "To Restore", false).unwrap();
        let response = snapshot_service::restore_snapshot(&pool, &id).unwrap();

        assert_eq!(response.opc_id, opc_id);
    }

    #[test]
    fn test_create_snapshot_nonexistent_opc() {
        let pool = setup();

        let result = snapshot_service::create_snapshot(&pool, "nonexistent-opc-id", "Test", false);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}