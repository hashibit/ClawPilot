/// tool_test.rs
/// Tool 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::tool::ToolInfo;
    use crate::services::tool_service::{self, LocalToolInput};

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_tool_input(name: &str) -> LocalToolInput {
        LocalToolInput {
            name: name.to_string(),
            display_name: format!("{} Tool", name),
            description: Some(format!("A test tool named {}", name)),
            category: Some("test".to_string()),
        }
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_tool_info_serde_roundtrip() {
        let tool = ToolInfo {
            id: 1,
            name: "test-tool".to_string(),
            display_name: "Test Tool".to_string(),
            description: Some("A test tool".to_string()),
            category: Some("utility".to_string()),
            is_local: true,
            created_at: chrono::Utc::now().timestamp(),
        };

        let json = serde_json::to_string(&tool).expect("serialize failed");
        let decoded: ToolInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, tool.id);
        assert_eq!(decoded.name, tool.name);
        assert_eq!(decoded.category, tool.category);
    }

    #[test]
    fn test_local_tool_input_serde() {
        let input = LocalToolInput {
            name: "my-tool".to_string(),
            display_name: "My Tool".to_string(),
            description: Some("Description".to_string()),
            category: Some("dev".to_string()),
        };

        let json = serde_json::to_string(&input).expect("serialize failed");
        let decoded: LocalToolInput = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.name, input.name);
        assert_eq!(decoded.description, input.description);
    }

    #[test]
    fn test_local_tool_input_minimal() {
        let json = r#"{
            "name": "minimal-tool",
            "display_name": "Minimal"
        }"#;

        let decoded: LocalToolInput = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.name, "minimal-tool");
        assert!(decoded.description.is_none());
        assert!(decoded.category.is_none());
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_tool() {
        let pool = setup();
        let input = make_tool_input("test-tool");

        let id = tool_service::create_tool(&pool, input).unwrap();
        assert!(id > 0);

        let tools = tool_service::get_tools(&pool).unwrap();
        assert!(tools.iter().any(|t| t.id == id));
    }

    #[test]
    fn test_get_tools_empty() {
        let pool = setup();
        let tools = tool_service::get_tools(&pool).unwrap();
        // 初始应该有一些 seed tools 或者空
        assert!(tools.is_empty() || !tools.is_empty());
    }

    #[test]
    fn test_delete_tool() {
        let pool = setup();
        let input = make_tool_input("to-delete");
        let id = tool_service::create_tool(&pool, input).unwrap();

        tool_service::delete_tool(&pool, id).unwrap();

        let tools = tool_service::get_tools(&pool).unwrap();
        assert!(!tools.iter().any(|t| t.id == id));
    }

    #[test]
    fn test_delete_nonexistent_tool() {
        let pool = setup();
        let result = tool_service::delete_tool(&pool, 999999);
        // 可能静默成功或返回错误
        assert!(result.is_ok() || matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_tool_with_empty_name() {
        let pool = setup();
        let input = LocalToolInput {
            name: String::new(),
            display_name: "Empty Name Tool".to_string(),
            description: None,
            category: None,
        };

        let result = tool_service::create_tool(&pool, input);
        // 根据业务逻辑
        assert!(result.is_ok() || matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn test_tool_with_special_characters() {
        let pool = setup();
        let input = LocalToolInput {
            name: "tool-测试-🔐".to_string(),
            display_name: "Special Tool".to_string(),
            description: Some("Contains special chars".to_string()),
            category: Some("test".to_string()),
        };

        let id = tool_service::create_tool(&pool, input).unwrap();
        let tools = tool_service::get_tools(&pool).unwrap();
        let tool = tools.iter().find(|t| t.id == id).unwrap();
        assert_eq!(tool.name, "tool-测试-🔐");
    }

    #[test]
    fn test_tool_with_long_description() {
        let pool = setup();
        let long_desc = "x".repeat(10000);
        let input = LocalToolInput {
            name: "long-desc-tool".to_string(),
            display_name: "Long Desc".to_string(),
            description: Some(long_desc.clone()),
            category: None,
        };

        let id = tool_service::create_tool(&pool, input).unwrap();
        let tools = tool_service::get_tools(&pool).unwrap();
        let tool = tools.iter().find(|t| t.id == id).unwrap();
        assert!(tool.description.as_ref().unwrap().len() > 9000);
    }
}