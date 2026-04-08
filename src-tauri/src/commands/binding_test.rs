/// binding_test.rs
/// Binding 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::binding::{BindingChannelType, BindingRule, TriggerMode};
    use crate::models::channel::{ChannelConfig, ChannelType};
    use crate::services::{binding_service, channel_service, opc_service, agent_service};
    use crate::models::opc::OpcConfig;
    use crate::models::agent::AgentConfig;

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn setup_full() -> (DbPool, String, String) {
        let pool = setup();

        // 创建 OPC
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

        // 创建 Agent
        let agent_id = agent_service::create_agent(&pool, AgentConfig {
            id: String::new(),
            opc_id: opc_id.clone(),
            name: "test-agent".to_string(),
            display_name: "Test Agent".to_string(),
            job_title: None,
            personality: None,
            description: None,
            initials: None,
            gradient_start: None,
            gradient_end: None,
            is_default: false,
            order_index: 0,
            model_provider: None,
            model_name: None,
            model: None,
            enabled_tools: vec![],
            disabled_tools: vec![],
            enabled_skills: vec![],
            guardrail_rules: vec![],
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        }).unwrap();

        (pool, opc_id, agent_id)
    }

    fn make_binding(opc_id: &str, agent_id: &str) -> BindingRule {
        BindingRule {
            id: String::new(),
            opc_id: opc_id.to_string(),
            channel_id: "oc_channel_123".to_string(),
            channel_name: "Engineering Group".to_string(),
            channel_type: BindingChannelType::Group,
            agent_id: agent_id.to_string(),
            agent_name: "Test Agent".to_string(),
            trigger_mode: TriggerMode::Mention,
            is_enabled: true,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_binding_rule_serde_roundtrip() {
        let binding = BindingRule {
            id: "binding-001".to_string(),
            opc_id: "opc-001".to_string(),
            channel_id: "oc_abc".to_string(),
            channel_name: "Test Channel".to_string(),
            channel_type: BindingChannelType::Group,
            agent_id: "agent-001".to_string(),
            agent_name: "Alice".to_string(),
            trigger_mode: TriggerMode::All,
            is_enabled: true,
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&binding).expect("serialize failed");
        let decoded: BindingRule = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, binding.id);
        assert_eq!(decoded.channel_type, BindingChannelType::Group);
        assert_eq!(decoded.trigger_mode, TriggerMode::All);
    }

    #[test]
    fn test_binding_channel_type_serde() {
        // 大写形式（前端发送）
        let group: BindingChannelType = serde_json::from_str(r#""GROUP""#).unwrap();
        let dm: BindingChannelType = serde_json::from_str(r#""DM""#).unwrap();

        assert_eq!(group, BindingChannelType::Group);
        assert_eq!(dm, BindingChannelType::Dm);
    }

    #[test]
    fn test_trigger_mode_serde() {
        let mention: TriggerMode = serde_json::from_str(r#""MENTION""#).unwrap();
        let all: TriggerMode = serde_json::from_str(r#""ALL""#).unwrap();

        assert_eq!(mention, TriggerMode::Mention);
        assert_eq!(all, TriggerMode::All);
    }

    #[test]
    fn test_binding_with_missing_optional_fields() {
        let json = r#"{
            "opc_id": "opc-001",
            "channel_id": "oc_123",
            "channel_name": "Test",
            "channel_type": "GROUP",
            "agent_id": "agent-001",
            "agent_name": "Agent",
            "trigger_mode": "MENTION"
        }"#;

        let decoded: BindingRule = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.id.is_empty()); // default
        // is_enabled 默认值取决于 struct 定义，可能是 false
    }

    // ─── 枚举转换测试 ───────────────────────────────────────────

    #[test]
    fn test_binding_channel_type_as_str() {
        assert_eq!(BindingChannelType::Group.as_str(), "GROUP");
        assert_eq!(BindingChannelType::Dm.as_str(), "DM");
    }

    #[test]
    fn test_binding_channel_type_from_str() {
        assert_eq!(BindingChannelType::from_str("GROUP"), Some(BindingChannelType::Group));
        assert_eq!(BindingChannelType::from_str("DM"), Some(BindingChannelType::Dm));
        assert_eq!(BindingChannelType::from_str("UNKNOWN"), None);
    }

    #[test]
    fn test_trigger_mode_as_str() {
        assert_eq!(TriggerMode::Mention.as_str(), "MENTION");
        assert_eq!(TriggerMode::All.as_str(), "ALL");
    }

    #[test]
    fn test_trigger_mode_from_str() {
        assert_eq!(TriggerMode::from_str("MENTION"), Some(TriggerMode::Mention));
        assert_eq!(TriggerMode::from_str("ALL"), Some(TriggerMode::All));
        assert_eq!(TriggerMode::from_str("UNKNOWN"), None);
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_binding() {
        let (pool, opc_id, agent_id) = setup_full();
        let binding = make_binding(&opc_id, &agent_id);

        let id = binding_service::create_binding(&pool, binding).unwrap();
        assert!(!id.is_empty());

        let retrieved = binding_service::get_binding(&pool, &id).unwrap();
        assert_eq!(retrieved.channel_id, "oc_channel_123");
    }

    #[test]
    fn test_get_bindings_by_opc() {
        let (pool, opc_id, agent_id) = setup_full();

        // 创建多个 binding
        let mut b1 = make_binding(&opc_id, &agent_id);
        b1.channel_id = "ch1".to_string();
        let mut b2 = make_binding(&opc_id, &agent_id);
        b2.channel_id = "ch2".to_string();
        b2.channel_type = BindingChannelType::Dm;

        binding_service::create_binding(&pool, b1).unwrap();
        binding_service::create_binding(&pool, b2).unwrap();

        let bindings = binding_service::get_bindings(&pool, &opc_id).unwrap();
        assert_eq!(bindings.len(), 2);
    }

    #[test]
    fn test_update_binding() {
        let (pool, opc_id, agent_id) = setup_full();
        let binding = make_binding(&opc_id, &agent_id);
        let id = binding_service::create_binding(&pool, binding).unwrap();

        // 更新
        let mut updated = binding_service::get_binding(&pool, &id).unwrap();
        updated.trigger_mode = TriggerMode::All;
        updated.is_enabled = false;

        binding_service::update_binding(&pool, &id, updated).unwrap();

        let retrieved = binding_service::get_binding(&pool, &id).unwrap();
        assert_eq!(retrieved.trigger_mode, TriggerMode::All);
        assert!(!retrieved.is_enabled);
    }

    #[test]
    fn test_toggle_binding() {
        let (pool, opc_id, agent_id) = setup_full();
        let binding = make_binding(&opc_id, &agent_id);
        let id = binding_service::create_binding(&pool, binding).unwrap();

        // 禁用
        binding_service::toggle_binding(&pool, &id, false).unwrap();
        let b = binding_service::get_binding(&pool, &id).unwrap();
        assert!(!b.is_enabled);

        // 启用
        binding_service::toggle_binding(&pool, &id, true).unwrap();
        let b = binding_service::get_binding(&pool, &id).unwrap();
        assert!(b.is_enabled);
    }

    #[test]
    fn test_delete_binding() {
        let (pool, opc_id, agent_id) = setup_full();
        let binding = make_binding(&opc_id, &agent_id);
        let id = binding_service::create_binding(&pool, binding).unwrap();

        binding_service::delete_binding(&pool, &id).unwrap();

        let result = binding_service::get_binding(&pool, &id);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_get_binding_nonexistent() {
        let pool = setup();
        let result = binding_service::get_binding(&pool, "nonexistent-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_binding_cross_opc_isolation() {
        let (pool, opc_a, agent_a) = setup_full();

        // 创建第二个 OPC
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

        // 创建新的 agent（不设置 id，让服务自动生成）
        let mut agent_b_config = AgentConfig {
            id: uuid::Uuid::new_v4().to_string(), // 显式设置唯一 ID
            opc_id: opc_b.clone(),
            name: "agent-b".to_string(),
            display_name: "Agent B".to_string(),
            job_title: None,
            personality: None,
            description: None,
            initials: None,
            gradient_start: None,
            gradient_end: None,
            is_default: false,
            order_index: 0,
            model_provider: None,
            model_name: None,
            model: None,
            enabled_tools: vec![],
            disabled_tools: vec![],
            enabled_skills: vec![],
            guardrail_rules: vec![],
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let agent_b = agent_service::create_agent(&pool, agent_b_config).unwrap();

        // 为每个 OPC 创建 binding（使用不同的 channel_id）
        let mut binding_a = make_binding(&opc_a, &agent_a);
        binding_a.channel_id = "channel_a".to_string();
        let mut binding_b = make_binding(&opc_b, &agent_b);
        binding_b.channel_id = "channel_b".to_string();

        binding_service::create_binding(&pool, binding_a).unwrap();
        binding_service::create_binding(&pool, binding_b).unwrap();

        // 验证隔离
        let bindings_a = binding_service::get_bindings(&pool, &opc_a).unwrap();
        let bindings_b = binding_service::get_bindings(&pool, &opc_b).unwrap();

        assert_eq!(bindings_a.len(), 1);
        assert_eq!(bindings_b.len(), 1);
    }

    #[test]
    fn test_binding_with_empty_channel_name() {
        let (pool, opc_id, agent_id) = setup_full();
        let mut binding = make_binding(&opc_id, &agent_id);
        binding.channel_name = String::new();

        let result = binding_service::create_binding(&pool, binding);
        assert!(result.is_ok());
    }

    #[test]
    fn test_binding_with_long_channel_id() {
        let (pool, opc_id, agent_id) = setup_full();
        let mut binding = make_binding(&opc_id, &agent_id);
        binding.channel_id = "oc_".to_string() + &"x".repeat(500);

        let id = binding_service::create_binding(&pool, binding).unwrap();
        let retrieved = binding_service::get_binding(&pool, &id).unwrap();
        assert!(retrieved.channel_id.len() > 500);
    }
}