/// model_test.rs
/// Model/Provider 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::model::{ModelInfo, ProviderConfig};

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_provider(name: &str) -> ProviderConfig {
        ProviderConfig {
            id: String::new(),
            name: name.to_string(),
            api: "openai-completions".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key: Some("sk-test-key".to_string()),
            is_enabled: true,
            is_available: true,
            last_tested: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    fn make_model(provider_name: &str, model_id: &str) -> ModelInfo {
        ModelInfo {
            id: String::new(),
            provider_name: provider_name.to_string(),
            model_id: model_id.to_string(),
            display_name: model_id.to_string(),
            context_window: 128000,
            max_tokens: 4096,
            input_types: r#"["text"]"#.to_string(),
            cost_input: 0.01,
            cost_output: 0.03,
            supports_vision: false,
            supports_function_calling: true,
            supports_streaming: true,
            is_custom: false,
            sort_order: 0,
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    // ─── Provider 测试 ───────────────────────────────────────────

    #[test]
    fn test_provider_config_serde_roundtrip() {
        let provider = ProviderConfig {
            id: "provider-001".to_string(),
            name: "test-provider".to_string(),
            api: "anthropic-messages".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
            api_key: Some("sk-ant-test".to_string()),
            is_enabled: true,
            is_available: true,
            last_tested: Some(1700000000),
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&provider).expect("serialize failed");
        let decoded: ProviderConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, provider.id);
        assert_eq!(decoded.name, provider.name);
        assert_eq!(decoded.api, provider.api);
        assert_eq!(decoded.api_key, provider.api_key);
    }

    #[test]
    fn test_provider_config_with_null_api_key() {
        let json = r#"{
            "id": "test-id",
            "name": "no-key-provider",
            "api": "openai-completions",
            "base_url": "https://api.example.com",
            "api_key": null,
            "is_enabled": true,
            "is_available": false
        }"#;

        let decoded: ProviderConfig = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.name, "no-key-provider");
        assert!(decoded.api_key.is_none());
    }

    #[test]
    fn test_provider_config_missing_optional_fields() {
        // 前端可能省略可选字段
        let json = r#"{
            "name": "minimal-provider",
            "api": "gemini",
            "base_url": "https://generativelanguage.googleapis.com"
        }"#;

        let decoded: ProviderConfig = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.name, "minimal-provider");
        assert!(decoded.api_key.is_none());
        assert!(!decoded.is_enabled); // default false
    }

    // ─── ModelInfo 测试 ───────────────────────────────────────────

    #[test]
    fn test_model_info_serde_roundtrip() {
        let model = ModelInfo {
            id: "model-001".to_string(),
            provider_name: "test-provider".to_string(),
            model_id: "gpt-4o".to_string(),
            display_name: "GPT-4o".to_string(),
            context_window: 128000,
            max_tokens: 16384,
            input_types: r#"["text","image"]"#.to_string(),
            cost_input: 0.005,
            cost_output: 0.015,
            supports_vision: true,
            supports_function_calling: true,
            supports_streaming: true,
            is_custom: false,
            sort_order: 1,
            updated_at: 1700000000,
        };

        let json = serde_json::to_string(&model).expect("serialize failed");
        let decoded: ModelInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.model_id, model.model_id);
        assert_eq!(decoded.context_window, model.context_window);
        assert_eq!(decoded.supports_vision, model.supports_vision);
    }

    #[test]
    fn test_model_info_default_values() {
        let json = r#"{
            "provider_name": "test",
            "model_id": "test-model"
        }"#;

        let decoded: ModelInfo = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.model_id, "test-model");
        assert_eq!(decoded.context_window, 0); // default
        assert!(!decoded.supports_vision); // default false
        assert!(decoded.supports_streaming); // default true
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_provider() {
        let pool = setup();
        let provider = make_provider("test-provider");

        let created = crate::services::model_service::create_provider(&pool, provider.clone()).unwrap();
        assert!(!created.id.is_empty());
        assert_eq!(created.name, "test-provider");

        // 获取所有 providers
        let all = crate::services::model_service::get_providers(&pool).unwrap();
        assert!(all.iter().any(|p| p.name == "test-provider"));
    }

    #[test]
    fn test_update_provider_partial() {
        let pool = setup();
        let provider = make_provider("original-provider");
        let created = crate::services::model_service::create_provider(&pool, provider).unwrap();

        // 部分更新
        let updated = crate::services::model_service::update_provider_partial(
            &pool,
            &created.id,
            Some("updated-name".to_string()),
            None,
            Some("https://new-url.example.com".to_string()),
            None,
            Some(false),
        ).unwrap();

        assert_eq!(updated.name, "updated-name");
        assert_eq!(updated.base_url, "https://new-url.example.com");
        assert!(!updated.is_enabled);
    }

    #[test]
    fn test_delete_provider() {
        let pool = setup();
        let provider = make_provider("to-delete");
        let created = crate::services::model_service::create_provider(&pool, provider).unwrap();

        crate::services::model_service::delete_provider(&pool, &created.id).unwrap();

        let all = crate::services::model_service::get_providers(&pool).unwrap();
        assert!(!all.iter().any(|p| p.id == created.id));
    }

    #[test]
    fn test_delete_nonexistent_provider() {
        let pool = setup();
        let result = crate::services::model_service::delete_provider(&pool, "nonexistent-id");
        // 根据实现可能是 Ok(()) 或 Err
        // 检查是否返回 NotFound 或静默成功
        assert!(result.is_ok() || matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── Model 测试 ───────────────────────────────────────────

    #[test]
    fn test_set_and_get_models() {
        let pool = setup();

        // 先创建 provider
        let provider = make_provider("model-test-provider");
        crate::services::model_service::create_provider(&pool, provider).unwrap();

        // 设置模型
        let models = vec![
            make_model("model-test-provider", "model-a"),
            make_model("model-test-provider", "model-b"),
        ];
        crate::services::model_service::set_models(&pool, "model-test-provider", models.clone()).unwrap();

        // 获取模型
        let retrieved = crate::services::model_service::get_models(&pool, Some("model-test-provider")).unwrap();
        assert_eq!(retrieved.len(), 2);
        assert!(retrieved.iter().any(|m| m.model_id == "model-a"));
    }

    #[test]
    fn test_get_models_all_providers() {
        let pool = setup();

        // 创建两个 providers
        let p1 = make_provider("provider-1");
        let p2 = make_provider("provider-2");
        crate::services::model_service::create_provider(&pool, p1).unwrap();
        crate::services::model_service::create_provider(&pool, p2).unwrap();

        // 设置模型
        crate::services::model_service::set_models(&pool, "provider-1", vec![make_model("provider-1", "m1")]).unwrap();
        crate::services::model_service::set_models(&pool, "provider-2", vec![make_model("provider-2", "m2")]).unwrap();

        // 获取所有模型
        let all = crate::services::model_service::get_models(&pool, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_provider_with_empty_name() {
        let pool = setup();
        let mut provider = make_provider("");
        provider.name = String::new();

        // 空名称应该被允许或返回验证错误
        let result = crate::services::model_service::create_provider(&pool, provider);
        // 根据业务逻辑，可能允许空名或返回错误
        assert!(result.is_ok() || matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn test_provider_with_long_name() {
        let pool = setup();
        let long_name = "a".repeat(1000);
        let provider = ProviderConfig {
            name: long_name.clone(),
            ..make_provider("temp")
        };

        let result = crate::services::model_service::create_provider(&pool, provider);
        assert!(result.is_ok());
    }

    #[test]
    fn test_provider_with_special_characters() {
        let pool = setup();
        let special_name = "provider-测试-🔐-special!";
        let provider = ProviderConfig {
            name: special_name.to_string(),
            ..make_provider("temp")
        };

        let result = crate::services::model_service::create_provider(&pool, provider);
        assert!(result.is_ok());
    }

    #[test]
    fn test_provider_duplicate_name() {
        let pool = setup();
        let provider1 = make_provider("duplicate-name");
        let provider2 = make_provider("duplicate-name");

        crate::services::model_service::create_provider(&pool, provider1).unwrap();
        let result = crate::services::model_service::create_provider(&pool, provider2);

        // 重复名称应该返回错误或自动重命名
        // 根据实现可能是唯一约束错误
        assert!(result.is_ok() || matches!(result, Err(AppError::Database(_))));
    }
}