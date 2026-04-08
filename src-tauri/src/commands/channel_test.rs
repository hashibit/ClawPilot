/// channel_test.rs
/// Channel 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::channel::{ChannelConfig, ChannelType, FeishuConfig};
    use crate::services::channel_service;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_opc() -> String {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, crate::models::opc::OpcConfig {
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
        // 返回 opc_id，但需要重新获取 pool
        opc_id
    }

    fn setup_with_opc() -> (DbPool, String) {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();

        let opc_id = crate::services::opc_service::create_opc(&pool, crate::models::opc::OpcConfig {
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

    fn make_channel(opc_id: &str) -> ChannelConfig {
        ChannelConfig {
            id: String::new(),
            opc_id: opc_id.to_string(),
            channel_type: ChannelType::Feishu,
            is_enabled: true,
            feishu_config: Some(FeishuConfig {
                app_id: "cli_test123".to_string(),
                app_secret: "secret_test".to_string(),
            }),
            is_connected: false,
            last_connected: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_channel_config_serde_roundtrip() {
        let channel = ChannelConfig {
            id: "channel-001".to_string(),
            opc_id: "opc-001".to_string(),
            channel_type: ChannelType::Feishu,
            is_enabled: true,
            feishu_config: Some(FeishuConfig {
                app_id: "cli_abc".to_string(),
                app_secret: "encrypted".to_string(),
            }),
            is_connected: true,
            last_connected: Some(1700000000),
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&channel).expect("serialize failed");
        let decoded: ChannelConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, channel.id);
        assert_eq!(decoded.channel_type, ChannelType::Feishu);
        assert!(decoded.feishu_config.is_some());
    }

    #[test]
    fn test_channel_type_serde() {
        // 前端发送字符串形式的枚举
        let json = r#"{"channel_type": "FEISHU"}"#;
        let v: serde_json::Value = serde_json::from_str(json).unwrap();

        // 验证可以解析为大写形式
        let ct: ChannelType = serde_json::from_value(v["channel_type"].clone()).unwrap();
        assert_eq!(ct, ChannelType::Feishu);
    }

    #[test]
    fn test_channel_config_without_feishu_config() {
        let json = r#"{
            "id": "ch-001",
            "opc_id": "opc-001",
            "channel_type": "FEISHU",
            "is_enabled": true
        }"#;

        let decoded: ChannelConfig = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.feishu_config.is_none());
        assert!(!decoded.is_connected); // default false
    }

    #[test]
    fn test_feishu_config_serde() {
        let config = FeishuConfig {
            app_id: "cli_xyz".to_string(),
            app_secret: "my-secret".to_string(),
        };

        let json = serde_json::to_string(&config).expect("serialize failed");
        let decoded: FeishuConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.app_id, config.app_id);
        assert_eq!(decoded.app_secret, config.app_secret);
    }

    #[test]
    fn test_feishu_config_default_values() {
        let json = r#"{}"#;
        let decoded: FeishuConfig = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.app_id.is_empty());
        assert!(decoded.app_secret.is_empty());
    }

    // ─── ChannelType 枚举测试 ───────────────────────────────────────────

    #[test]
    fn test_channel_type_as_str() {
        assert_eq!(ChannelType::Feishu.as_str(), "FEISHU");
        assert_eq!(ChannelType::Dingtalk.as_str(), "DINGTALK");
        assert_eq!(ChannelType::Wechat.as_str(), "WECHAT");
    }

    #[test]
    fn test_channel_type_from_str() {
        assert_eq!(ChannelType::from_str("FEISHU"), Some(ChannelType::Feishu));
        assert_eq!(ChannelType::from_str("DINGTALK"), Some(ChannelType::Dingtalk));
        assert_eq!(ChannelType::from_str("WECHAT"), Some(ChannelType::Wechat));
        assert_eq!(ChannelType::from_str("UNKNOWN"), None);
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_channel() {
        let (pool, opc_id) = setup_with_opc();
        let channel = make_channel(&opc_id);

        let id = channel_service::upsert_channel(&pool, channel).unwrap();
        assert!(id > 0);

        let retrieved = channel_service::get_channel(&pool, id).unwrap();
        assert_eq!(retrieved.channel_type, ChannelType::Feishu);
    }

    #[test]
    fn test_get_channels_by_opc() {
        let (pool, opc_id) = setup_with_opc();

        // 创建多个 channel
        let ch1 = make_channel(&opc_id);
        let mut ch2 = make_channel(&opc_id);
        ch2.feishu_config = None;

        channel_service::upsert_channel(&pool, ch1).unwrap();
        channel_service::upsert_channel(&pool, ch2).unwrap();

        let channels = channel_service::get_channels(&pool, &opc_id).unwrap();
        assert_eq!(channels.len(), 2);
    }

    #[test]
    fn test_update_channel() {
        let (pool, opc_id) = setup_with_opc();
        let channel = make_channel(&opc_id);
        let id = channel_service::upsert_channel(&pool, channel).unwrap();

        // 更新 channel
        let mut updated = channel_service::get_channel(&pool, id).unwrap();
        updated.is_enabled = false;
        updated.feishu_config = Some(FeishuConfig {
            app_id: "cli_updated".to_string(),
            app_secret: "new_secret".to_string(),
        });

        let new_id = channel_service::upsert_channel(&pool, updated).unwrap();
        assert_eq!(new_id, id); // upsert 应该返回相同 ID

        let retrieved = channel_service::get_channel(&pool, id).unwrap();
        assert!(!retrieved.is_enabled);
    }

    #[test]
    fn test_delete_channel() {
        let (pool, opc_id) = setup_with_opc();
        let channel = make_channel(&opc_id);
        let id = channel_service::upsert_channel(&pool, channel).unwrap();

        channel_service::delete_channel(&pool, id).unwrap();

        let result = channel_service::get_channel(&pool, id);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_nonexistent_channel() {
        let (pool, _) = setup_with_opc();
        let result = channel_service::delete_channel(&pool, 999999);
        // 可能静默成功或返回 NotFound
        assert!(result.is_ok() || matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_channel_nonexistent() {
        let (pool, _) = setup_with_opc();
        let result = channel_service::get_channel(&pool, 999999);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_channel_with_empty_opc_id() {
        let (pool, _) = setup_with_opc();
        let channel = ChannelConfig {
            opc_id: String::new(),
            ..make_channel("dummy")
        };

        // 空 opc_id 会触发 FOREIGN KEY 约束错误
        let result = channel_service::upsert_channel(&pool, channel);
        // FOREIGN KEY constraint 或 Validation 错误都符合预期
        assert!(matches!(result, Err(AppError::Database(_))) || matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn test_channel_with_empty_feishu_config() {
        let (pool, opc_id) = setup_with_opc();
        let channel = ChannelConfig {
            feishu_config: Some(FeishuConfig {
                app_id: String::new(),
                app_secret: String::new(),
            }),
            ..make_channel(&opc_id)
        };

        let id = channel_service::upsert_channel(&pool, channel).unwrap();
        let retrieved = channel_service::get_channel(&pool, id).unwrap();

        assert!(retrieved.feishu_config.is_some());
        let fc = retrieved.feishu_config.unwrap();
        assert!(fc.app_id.is_empty());
    }

    #[test]
    fn test_channel_cross_opc_isolation() {
        let (pool, opc_a) = setup_with_opc();
        let opc_b = crate::services::opc_service::create_opc(&pool, crate::models::opc::OpcConfig {
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

        // 为每个 OPC 创建 channel
        channel_service::upsert_channel(&pool, make_channel(&opc_a)).unwrap();
        channel_service::upsert_channel(&pool, make_channel(&opc_b)).unwrap();

        // 验证隔离
        let channels_a = channel_service::get_channels(&pool, &opc_a).unwrap();
        let channels_b = channel_service::get_channels(&pool, &opc_b).unwrap();

        assert_eq!(channels_a.len(), 1);
        assert_eq!(channels_b.len(), 1);
    }
}