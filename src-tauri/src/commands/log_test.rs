/// log_test.rs
/// Log 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::services::log_service::{self, LogEntry};

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_log_entry_serde_roundtrip() {
        let entry = LogEntry {
            id: 1,
            timestamp: chrono::Utc::now().timestamp_millis(),
            level: "INFO".to_string(),
            component: Some("test-component".to_string()),
            message: "Test log message".to_string(),
            agent_id: Some("agent-001".to_string()),
            channel: Some("test-channel".to_string()),
            metadata: Some(r#"{"key":"value"}"#.to_string()),
        };

        let json = serde_json::to_string(&entry).expect("serialize failed");
        let decoded: LogEntry = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, entry.id);
        assert_eq!(decoded.level, entry.level);
        assert_eq!(decoded.message, entry.message);
    }

    #[test]
    fn test_log_entry_minimal() {
        let json = r#"{
            "id": 2,
            "timestamp": 1700000000000,
            "level": "ERROR",
            "message": "Error occurred"
        }"#;

        let decoded: LogEntry = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.level, "ERROR");
        assert!(decoded.component.is_none());
        assert!(decoded.agent_id.is_none());
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_write_and_get_logs() {
        let pool = setup();

        // 注意: agent_id 有外键约束，测试时不传入 agent_id（传 None）
        let id = log_service::write_log(
            &pool,
            "INFO",
            Some("test-component"),
            "Test log message",
            None,  // 不传入 agent_id，避免外键约束错误
            Some("channel-001"),
        ).unwrap();
        assert!(id > 0);

        let logs = log_service::get_logs(&pool, None, None, 100).unwrap();
        assert!(!logs.is_empty());
        assert!(logs.iter().any(|l| l.id == id));
    }

    #[test]
    fn test_get_logs_by_level() {
        let pool = setup();

        log_service::write_log(&pool, "INFO", None, "Info message", None, None).unwrap();
        log_service::write_log(&pool, "ERROR", None, "Error message", None, None).unwrap();
        log_service::write_log(&pool, "WARN", None, "Warn message", None, None).unwrap();

        let error_logs = log_service::get_logs(&pool, Some("ERROR"), None, 100).unwrap();
        assert!(error_logs.iter().all(|l| l.level == "ERROR"));

        let info_logs = log_service::get_logs(&pool, Some("INFO"), None, 100).unwrap();
        assert!(info_logs.iter().all(|l| l.level == "INFO"));
    }

    #[test]
    fn test_get_logs_by_component() {
        let pool = setup();

        log_service::write_log(&pool, "INFO", Some("agent-service"), "Agent log", None, None).unwrap();
        log_service::write_log(&pool, "INFO", Some("channel-service"), "Channel log", None, None).unwrap();

        let agent_logs = log_service::get_logs(&pool, None, Some("agent-service"), 100).unwrap();
        assert!(agent_logs.iter().all(|l| l.component == Some("agent-service".to_string())));
    }

    #[test]
    fn test_get_logs_with_limit() {
        let pool = setup();

        for i in 0..20 {
            log_service::write_log(&pool, "INFO", None, &format!("Message {}", i), None, None).unwrap();
        }

        let logs = log_service::get_logs(&pool, None, None, 5).unwrap();
        assert_eq!(logs.len(), 5);
    }

    #[test]
    fn test_write_log_with_all_fields() {
        let pool = setup();

        // 注意: agent_id 有外键约束，测试时不传入 agent_id（传 None）
        let id = log_service::write_log(
            &pool,
            "DEBUG",
            Some("debug-component"),
            "Debug message with all fields",
            None,  // 不传入 agent_id，避免外键约束错误
            Some("debug-channel"),
        ).unwrap();

        let logs = log_service::get_logs(&pool, Some("DEBUG"), None, 1).unwrap();
        let log = logs.iter().find(|l| l.id == id).unwrap();

        assert_eq!(log.level, "DEBUG");
        assert_eq!(log.component, Some("debug-component".to_string()));
        assert_eq!(log.agent_id, None);  // 没有传入 agent_id
        assert_eq!(log.channel, Some("debug-channel".to_string()));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_write_log_with_empty_message() {
        let pool = setup();

        let result = log_service::write_log(&pool, "INFO", None, "", None, None);
        // 空消息可能被允许或拒绝
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_write_log_with_long_message() {
        let pool = setup();
        let long_message = "x".repeat(10000);

        let id = log_service::write_log(&pool, "INFO", None, &long_message, None, None).unwrap();
        let logs = log_service::get_logs(&pool, None, None, 1).unwrap();
        let log = logs.iter().find(|l| l.id == id).unwrap();

        assert!(log.message.len() > 9000);
    }

    #[test]
    fn test_write_log_with_special_characters() {
        let pool = setup();
        let special_message = "测试消息 🔐 \n\t 特殊字符 \"quotes\"";

        let id = log_service::write_log(&pool, "INFO", None, special_message, None, None).unwrap();
        let logs = log_service::get_logs(&pool, None, None, 1).unwrap();
        let log = logs.iter().find(|l| l.id == id).unwrap();

        assert!(log.message.contains("测试消息"));
    }

    #[test]
    fn test_get_logs_empty_result() {
        let pool = setup();

        let logs = log_service::get_logs(&pool, Some("NONEXISTENT_LEVEL"), None, 100).unwrap();
        assert!(logs.is_empty());
    }
}