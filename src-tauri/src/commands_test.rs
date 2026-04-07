/// commands_test.rs
/// Tauri 命令测试
#[cfg(test)]
mod tests {
    use crate::commands::opc::*;
    use crate::commands::agent::*;
    use crate::database::{migrations, pool::DbPool};
    use crate::models::opc::OpcConfig;
    use crate::models::agent::AgentConfig;

    fn setup() -> DbPool {
        use rusqlite::Connection;
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
            office_id: None,
            office_name: None,
        }
    }

    // --- OPC 命令测试 ---
    #[test]
    fn test_get_all_opcs_command() {
        let pool = setup();
        
        // 创建测试数据
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        // 调用命令
        let result = get_all_opcs(pool.clone());
        assert!(result.is_ok());
        
        let opcs = result.unwrap();
        assert!(!opcs.is_empty());
        assert!(opcs.iter().any(|o| o.id == opc_id));
    }

    #[test]
    fn test_get_opc_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        let result = get_opc(pool.clone(), opc_id.clone());
        assert!(result.is_ok());
        
        let opc = result.unwrap();
        assert_eq!(opc.id, opc_id);
    }

    #[test]
    fn test_get_opc_not_found() {
        let pool = setup();
        
        let result = get_opc(pool.clone(), "non-existent".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_create_opc_command() {
        let pool = setup();
        let opc = make_opc("new-opc");
        
        let result = create_opc(pool.clone(), opc);
        assert!(result.is_ok());
        
        let created_id = result.unwrap();
        assert!(!created_id.is_empty());
    }

    #[test]
    fn test_update_opc_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("original")).unwrap();
        
        let mut updated_opc = make_opc("updated");
        updated_opc.id = opc_id.clone();
        
        let result = update_opc(pool.clone(), opc_id, updated_opc);
        assert!(result.is_ok());
    }

    #[test]
    fn test_delete_opc_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("to-delete")).unwrap();
        
        let result = delete_opc(pool.clone(), opc_id.clone());
        assert!(result.is_ok());
        
        // 验证已删除
        let get_result = get_opc(pool.clone(), opc_id);
        assert!(get_result.is_err());
    }

    // --- Agent 命令测试 ---
    #[test]
    fn test_get_agents_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        // 创建 Agent
        let mut agent = AgentConfig {
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
        let agent_id = crate::services::agent_service::create_agent(&pool, agent).unwrap();
        
        let result = get_agents(pool.clone(), opc_id);
        assert!(result.is_ok());
        
        let agents = result.unwrap();
        assert!(!agents.is_empty());
        assert!(agents.iter().any(|a| a.id == agent_id));
    }

    #[test]
    fn test_create_agent_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        let mut agent = AgentConfig {
            id: String::new(),
            opc_id,
            name: "new-agent".to_string(),
            display_name: "New Agent".to_string(),
            job_title: Some("Developer".to_string()),
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
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        };
        
        let result = create_agent(pool.clone(), agent);
        assert!(result.is_ok());
        
        let created_id = result.unwrap();
        assert!(!created_id.is_empty());
    }

    #[test]
    fn test_update_agent_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        let mut agent = AgentConfig {
            id: String::new(),
            opc_id: opc_id.clone(),
            name: "original-agent".to_string(),
            display_name: "Original".to_string(),
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
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let agent_id = crate::services::agent_service::create_agent(&pool, agent).unwrap();
        
        let mut updated_agent = AgentConfig {
            id: agent_id.clone(),
            opc_id,
            name: "updated-agent".to_string(),
            display_name: "Updated".to_string(),
            job_title: Some("Senior Developer".to_string()),
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
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        };
        
        let result = update_agent(pool.clone(), agent_id, updated_agent);
        assert!(result.is_ok());
    }

    #[test]
    fn test_delete_agent_command() {
        let pool = setup();
        let opc_id = crate::services::opc_service::create_opc(&pool, make_opc("test-opc")).unwrap();
        
        let mut agent = AgentConfig {
            id: String::new(),
            opc_id,
            name: "to-delete".to_string(),
            display_name: "To Delete".to_string(),
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
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            reports_to: vec![],
            manages: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let agent_id = crate::services::agent_service::create_agent(&pool, agent).unwrap();
        
        let result = delete_agent(pool.clone(), agent_id.clone());
        assert!(result.is_ok());
        
        // 验证已删除
        let get_result = crate::services::agent_service::get_agent(&pool, &agent_id);
        assert!(get_result.is_err());
    }

    // --- 工具函数测试 ---
    #[test]
    fn test_crypto_encrypt_decrypt() {
        use crate::utils::crypto;
        
        let original = "sk-test-api-key-12345";
        let encrypted = crypto::encrypt(original).unwrap();
        
        // 加密后不等于原文
        assert_ne!(encrypted, original);
        
        // 解密后等于原文
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_crypto_random_nonce() {
        use crate::utils::crypto;
        
        let key = "test-key";
        let c1 = crypto::encrypt(key).unwrap();
        let c2 = crypto::encrypt(key).unwrap();
        
        // AES-GCM 每次加密应产生不同密文
        assert_ne!(c1, c2);
    }
}
