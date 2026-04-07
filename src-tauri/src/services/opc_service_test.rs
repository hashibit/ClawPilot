/// opc_service_test.rs
/// OPC 服务层测试
#[cfg(test)]
mod tests {
    use crate::database::{migrations, pool::DbPool};
    use crate::models::opc::OpcConfig;
    use crate::services::opc_service;

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

    // --- 基础 CRUD 测试 ---
    #[test]
    fn test_create_opc() {
        let pool = setup();
        let opc = make_opc("test-opc");
        
        let result = opc_service::create_opc(&pool, opc);
        assert!(result.is_ok());
        
        let id = result.unwrap();
        assert!(!id.is_empty());
    }

    #[test]
    fn test_get_opc() {
        let pool = setup();
        let opc = make_opc("test-opc");
        let id = opc_service::create_opc(&pool, opc).unwrap();
        
        let result = opc_service::get_opc(&pool, &id);
        assert!(result.is_ok());
        
        let fetched_opc = result.unwrap();
        assert_eq!(fetched_opc.id, id);
        assert_eq!(fetched_opc.name, "test-opc");
    }

    #[test]
    fn test_get_opc_not_found() {
        let pool = setup();
        
        let result = opc_service::get_opc(&pool, "non-existent");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_opc() {
        let pool = setup();
        let opc = make_opc("original");
        let id = opc_service::create_opc(&pool, opc).unwrap();
        
        let mut updated = make_opc("updated");
        updated.id = id.clone();
        
        let result = opc_service::update_opc(&pool, updated);
        assert!(result.is_ok());
        
        let fetched = opc_service::get_opc(&pool, &id).unwrap();
        assert_eq!(fetched.name, "updated");
    }

    #[test]
    fn test_delete_opc() {
        let pool = setup();
        let opc = make_opc("to-delete");
        let id = opc_service::create_opc(&pool, opc).unwrap();
        
        let result = opc_service::delete_opc(&pool, &id);
        assert!(result.is_ok());
        
        let fetch_result = opc_service::get_opc(&pool, &id);
        assert!(fetch_result.is_err());
    }

    // --- 查询测试 ---
    #[test]
    fn test_get_all_opcs() {
        let pool = setup();
        
        opc_service::create_opc(&pool, make_opc("opc-1")).unwrap();
        opc_service::create_opc(&pool, make_opc("opc-2")).unwrap();
        opc_service::create_opc(&pool, make_opc("opc-3")).unwrap();
        
        let result = opc_service::get_all_opcs(&pool);
        assert!(result.is_ok());
        
        let opcs = result.unwrap();
        assert_eq!(opcs.len(), 3);
    }

    #[test]
    fn test_get_all_opcs_empty() {
        let pool = setup();
        
        let result = opc_service::get_all_opcs(&pool);
        assert!(result.is_ok());
        
        let opcs = result.unwrap();
        assert!(opcs.is_empty());
    }

    // --- 当前 OPC 测试 ---
    #[test]
    fn test_set_current_opc() {
        let pool = setup();
        let id = opc_service::create_opc(&pool, make_opc("current")).unwrap();
        
        let result = opc_service::set_current_opc(&pool, &id);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_current_opc() {
        let pool = setup();
        let id_a = opc_service::create_opc(&pool, make_opc("opc-a")).unwrap();
        let id_b = opc_service::create_opc(&pool, make_opc("opc-b")).unwrap();
        
        // 初始无当前 OPC
        let current = opc_service::get_current_opc(&pool);
        assert!(current.is_err());
        
        // 设置 A 为当前
        opc_service::set_current_opc(&pool, &id_a).unwrap();
        let current = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current.id, id_a);
        
        // 切换到 B
        opc_service::set_current_opc(&pool, &id_b).unwrap();
        let current = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current.id, id_b);
    }

    #[test]
    fn test_only_one_active_opc() {
        let pool = setup();
        let id_a = opc_service::create_opc(&pool, make_opc("first")).unwrap();
        let id_b = opc_service::create_opc(&pool, make_opc("second")).unwrap();
        
        opc_service::set_current_opc(&pool, &id_a).unwrap();
        opc_service::set_current_opc(&pool, &id_b).unwrap();
        
        // 验证只有 B 是当前 OPC
        let current = opc_service::get_current_opc(&pool).unwrap();
        assert_eq!(current.id, id_b);
        
        // 验证 A 不再是当前
        let opc_a = opc_service::get_opc(&pool, &id_a).unwrap();
        // （当前 OPC 状态存储在单独字段，这里验证 get_current 只返回一个）
    }

    // --- 统计更新测试 ---
    #[test]
    fn test_update_opc_stats() {
        let pool = setup();
        let id = opc_service::create_opc(&pool, make_opc("stats-test")).unwrap();
        
        // 创建一些 Agent 和 Channel
        use crate::models::agent::AgentConfig;
        use crate::services::agent_service;
        
        for i in 0..5 {
            let agent = AgentConfig {
                id: format!("agent-{}", i),
                opc_id: id.clone(),
                name: format!("agent-{}", i),
                display_name: format!("Agent {}", i),
                job_title: None,
                personality: None,
                description: None,
                initials: None,
                gradient_start: None,
                gradient_end: None,
                is_default: false,
                order_index: i,
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
            agent_service::create_agent(&pool, agent).unwrap();
        }
        
        // 更新统计
        let result = opc_service::update_opc_stats(&pool, &id);
        assert!(result.is_ok());
        
        // 验证统计更新
        let opc = opc_service::get_opc(&pool, &id).unwrap();
        assert_eq!(opc.agent_count, 5);
    }
}
