/// integration_tests.rs
/// 跨服务集成测试：验证 OPC/Agent/Channel/Binding 等的数据一致性与边界行为
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::{
        agent::AgentConfig,
        binding::{BindingChannelType, BindingRule, TriggerMode},
        channel::{ChannelConfig, ChannelType},
        opc::OpcConfig,
    };
    use crate::services::{
        agent_service, binding_service, channel_service, opc_service,
    };

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
        }
    }

    fn make_agent(opc_id: &str, name: &str) -> AgentConfig {
        AgentConfig {
            id: uuid::Uuid::new_v4().to_string(),
            opc_id: opc_id.to_string(),
            name: name.to_string(),
            display_name: name.to_string(),
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
            enabled_tools: vec![],
            disabled_tools: vec![],
            enabled_skills: vec![],
            guardrail_rules: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        }
    }

    fn make_channel(opc_id: &str) -> ChannelConfig {
        ChannelConfig {
            id: String::new(),
            opc_id: opc_id.to_string(),
            channel_type: ChannelType::Feishu,
            is_enabled: true,
            feishu_config: None,
            is_connected: false,
            last_connected: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    // ─── 1. OPC + Agent 数量一致性 ───────────────────────────────────────────

    #[test]
    fn test_opc_agent_consistency() {
        let pool = setup();
        let opc_id = opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();

        // 创建 3 个 Agent
        let a1 = agent_service::create_agent(&pool, make_agent(&opc_id, "alice")).unwrap();
        let a2 = agent_service::create_agent(&pool, make_agent(&opc_id, "bob")).unwrap();
        let _a3 = agent_service::create_agent(&pool, make_agent(&opc_id, "carol")).unwrap();

        let agents = agent_service::get_agents(&pool, &opc_id).unwrap();
        assert_eq!(agents.len(), 3);

        // 删除一个 Agent 后列表减少
        agent_service::delete_agent(&pool, &a2).unwrap();
        let agents_after = agent_service::get_agents(&pool, &opc_id).unwrap();
        assert_eq!(agents_after.len(), 2);

        // 剩余 Agent 包含 a1
        let ids: Vec<&str> = agents_after.iter().map(|a| a.id.as_str()).collect();
        assert!(ids.contains(&a1.as_str()));
    }

    // ─── 2. Channel + Binding 关联完整性 ────────────────────────────────────

    #[test]
    fn test_channel_binding_consistency() {
        let pool = setup();
        let opc_id = opc_service::create_opc(&pool, make_opc("bind-opc")).unwrap();
        let agent_id = agent_service::create_agent(&pool, make_agent(&opc_id, "agent-x")).unwrap();
        let channel_id = channel_service::upsert_channel(&pool, make_channel(&opc_id)).unwrap();
        let channel_id_str = channel_id.to_string();

        let binding = BindingRule {
            id: String::new(),
            opc_id: opc_id.clone(),
            channel_id: channel_id_str.clone(),
            channel_name: "test-channel".to_string(),
            channel_type: BindingChannelType::Group,
            agent_id: agent_id.clone(),
            agent_name: "agent-x".to_string(),
            trigger_mode: TriggerMode::All,
            is_enabled: true,
            created_at: 0,
            updated_at: 0,
        };
        let binding_id = binding_service::create_binding(&pool, binding).unwrap();

        let bindings = binding_service::get_bindings(&pool, &opc_id).unwrap();
        assert_eq!(bindings.len(), 1);
        assert_eq!(bindings[0].id, binding_id);
        assert_eq!(bindings[0].channel_id, channel_id_str);
        assert_eq!(bindings[0].agent_id, agent_id);
    }

    // ─── 3. 跨 OPC 数据隔离 ─────────────────────────────────────────────────

    #[test]
    fn test_cross_opc_isolation() {
        let pool = setup();
        let opc_a = opc_service::create_opc(&pool, make_opc("opc-a")).unwrap();
        let opc_b = opc_service::create_opc(&pool, make_opc("opc-b")).unwrap();

        agent_service::create_agent(&pool, make_agent(&opc_a, "a-agent")).unwrap();
        agent_service::create_agent(&pool, make_agent(&opc_b, "b-agent1")).unwrap();
        agent_service::create_agent(&pool, make_agent(&opc_b, "b-agent2")).unwrap();

        let agents_a = agent_service::get_agents(&pool, &opc_a).unwrap();
        let agents_b = agent_service::get_agents(&pool, &opc_b).unwrap();

        assert_eq!(agents_a.len(), 1, "opc-a 应只有 1 个 agent");
        assert_eq!(agents_b.len(), 2, "opc-b 应有 2 个 agent");
        assert_eq!(agents_a[0].opc_id, opc_a);
        assert!(agents_b.iter().all(|a| a.opc_id == opc_b));
    }

    // ─── 4. 不存在的资源返回 NotFound ────────────────────────────────────────

    #[test]
    fn test_not_found_errors() {
        let pool = setup();

        let opc_err = opc_service::get_opc(&pool, "nonexistent-id");
        assert!(matches!(opc_err, Err(AppError::NotFound(_))));

        let agent_err = agent_service::get_agent(&pool, "no-such-agent");
        assert!(matches!(agent_err, Err(AppError::NotFound(_))));

        let channel_err = channel_service::get_channel(&pool, 999999);
        assert!(matches!(channel_err, Err(AppError::NotFound(_))));
    }

    // ─── 5. set_current_opc 只有一个激活 OPC ────────────────────────────────

    #[test]
    fn test_only_one_active_opc() {
        let pool = setup();
        let id_a = opc_service::create_opc(&pool, make_opc("opc-first")).unwrap();
        let id_b = opc_service::create_opc(&pool, make_opc("opc-second")).unwrap();

        opc_service::set_current_opc(&pool, &id_a).unwrap();
        let current_a = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current_a.id, id_a);

        // 切换到 B 后，A 不再是当前 OPC
        opc_service::set_current_opc(&pool, &id_b).unwrap();
        let current_b = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current_b.id, id_b);

        // set_current_opc 切换后，当前 OPC 确实是 B 而非 A
        let current_again = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current_again.id, id_b, "当前 OPC 应为 opc-second");
    }

    // ─── 6. 安全：API Key 加解密一致性 ───────────────────────────────────────

    #[test]
    fn test_api_key_encrypt_decrypt_roundtrip() {
        use crate::utils::crypto;
        let original = "sk-test-key-12345-abcde";
        let encrypted = crypto::encrypt(original).unwrap();
        // 加密后不等于原文
        assert_ne!(encrypted, original);
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_api_key_encrypt_produces_different_ciphertexts() {
        use crate::utils::crypto;
        // AES-GCM 每次加密应产生不同的密文（随机 nonce）
        let key = "same-key";
        let c1 = crypto::encrypt(key).unwrap();
        let c2 = crypto::encrypt(key).unwrap();
        assert_ne!(c1, c2, "相同明文每次加密应产生不同密文（随机 nonce）");
    }
}
