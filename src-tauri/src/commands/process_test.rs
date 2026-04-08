/// process_test.rs
/// Process 命令测试
/// 注意：实际进程操作测试需要完整的 OpenClaw 环境，这里主要测试数据结构

#[cfg(test)]
mod tests {
    use crate::commands::process::ProcessStatusResponse;

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_process_status_response_serde_roundtrip() {
        let status = ProcessStatusResponse {
            is_running: true,
            pid: Some(12345),
            uptime_seconds: Some(3600),
            probed_at: 1700000000000,
            daemon_available: true,
            daemon_error: None,
        };

        let json = serde_json::to_string(&status).expect("serialize failed");
        let decoded: ProcessStatusResponse = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.is_running, status.is_running);
        assert_eq!(decoded.pid, status.pid);
        assert_eq!(decoded.uptime_seconds, status.uptime_seconds);
    }

    #[test]
    fn test_process_status_response_not_running() {
        let status = ProcessStatusResponse {
            is_running: false,
            pid: None,
            uptime_seconds: None,
            probed_at: 1700000000000,
            daemon_available: false,
            daemon_error: Some("Connection refused".to_string()),
        };

        let json = serde_json::to_string(&status).expect("serialize failed");
        let decoded: ProcessStatusResponse = serde_json::from_str(&json).expect("deserialize failed");

        assert!(!decoded.is_running);
        assert!(decoded.pid.is_none());
        assert_eq!(decoded.daemon_error, Some("Connection refused".to_string()));
    }

    #[test]
    fn test_process_status_response_from_json() {
        let json = r#"{
            "is_running": true,
            "pid": 9999,
            "uptime_seconds": 7200,
            "probed_at": 1700000000000,
            "daemon_available": true,
            "daemon_error": null
        }"#;

        let decoded: ProcessStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.is_running);
        assert_eq!(decoded.pid, Some(9999));
        assert_eq!(decoded.uptime_seconds, Some(7200));
    }

    #[test]
    fn test_process_status_response_minimal() {
        let json = r#"{
            "is_running": false,
            "probed_at": 1700000000000,
            "daemon_available": false
        }"#;

        let decoded: ProcessStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert!(!decoded.is_running);
        assert!(decoded.pid.is_none());
        assert!(!decoded.daemon_available);
    }
}