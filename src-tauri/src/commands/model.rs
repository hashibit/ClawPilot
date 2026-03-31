use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::model::{ModelInfo, ProviderConfig};
use crate::services::model_service;

#[tauri::command]
pub fn get_providers(pool: State<'_, DbPool>) -> Result<Vec<ProviderConfig>> {
    model_service::get_providers(&pool)
}

#[tauri::command]
pub fn get_provider(pool: State<'_, DbPool>, provider_type: String) -> Result<ProviderConfig> {
    model_service::get_provider(&pool, &provider_type)
}

#[tauri::command]
pub fn update_provider(pool: State<'_, DbPool>, config: ProviderConfig) -> Result<()> {
    model_service::upsert_provider(&pool, config)
}

#[tauri::command]
pub fn create_provider(pool: State<'_, DbPool>, config: ProviderConfig) -> Result<ProviderConfig> {
    model_service::upsert_provider(&pool, config.clone())?;
    Ok(config)
}

#[tauri::command]
pub fn delete_provider(pool: State<'_, DbPool>, provider_type: String) -> Result<()> {
    model_service::delete_provider(&pool, &provider_type)
}

#[tauri::command]
pub fn get_models(pool: State<'_, DbPool>) -> Result<Vec<ModelInfo>> {
    model_service::get_models(&pool)
}

#[tauri::command]
pub fn set_models(pool: State<'_, DbPool>, provider_type: String, models: Vec<ModelInfo>) -> Result<()> {
    model_service::set_models(&pool, &provider_type, models)
}

#[tauri::command]
pub fn test_provider(pool: State<'_, DbPool>, provider_type: String) -> Result<bool> {
    model_service::test_provider(&pool, &provider_type)
}

/// 已知提供商信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KnownProviderInfo {
    pub suggest_name: String,
    pub api: String,
    pub match_urls: Vec<String>,
    pub models: Vec<KnownModelInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KnownModelInfo {
    pub model_id: String,
    pub display_name: String,
    pub context_window: i32,
    pub max_tokens: i32,
    pub input_types: String,
    pub supports_vision: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SuggestedProvider {
    pub name: String,
    pub api: String,
    pub models: Vec<KnownModelInfo>,
}

/// 已知提供商列表（硬编码，用于自动识别）
fn known_providers() -> &'static [KnownProviderInfo] {
    use once_cell::sync::Lazy;
    static KNOWN: Lazy<Vec<KnownProviderInfo>> = Lazy::new(|| {
        vec![
            KnownProviderInfo {
                suggest_name: "bailian".to_string(),
                api: "openai-completions".to_string(),
                match_urls: vec![
                    "dashscope.aliyuncs.com".to_string(),
                    "coding.dashscope.aliyuncs.com".to_string(),
                    "coding-intl.dashscope.aliyuncs.com".to_string(),
                ],
                models: vec![
                    KnownModelInfo { model_id: "qwen3.5-plus".to_string(), display_name: "Qwen3.5 Plus".to_string(), context_window: 1000000, max_tokens: 65536, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "qwen3-max-2026-01-23".to_string(), display_name: "Qwen3 Max".to_string(), context_window: 262144, max_tokens: 65536, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "qwen3-coder-plus".to_string(), display_name: "Qwen3 Coder Plus".to_string(), context_window: 1000000, max_tokens: 65536, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "qwen3-coder-next".to_string(), display_name: "Qwen3 Coder Next".to_string(), context_window: 262144, max_tokens: 65536, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "kimi-k2.5".to_string(), display_name: "Kimi K2.5".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "glm-5".to_string(), display_name: "GLM-5".to_string(), context_window: 202752, max_tokens: 16384, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "glm-4.7".to_string(), display_name: "GLM-4.7".to_string(), context_window: 202752, max_tokens: 16384, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "MiniMax-M2.5".to_string(), display_name: "MiniMax M2.5".to_string(), context_window: 1000000, max_tokens: 131072, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                ],
            },
            KnownProviderInfo {
                suggest_name: "volcengine".to_string(),
                api: "openai-completions".to_string(),
                match_urls: vec!["ark.cn-beijing.volces.com".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "doubao-seed-code-preview-251028".to_string(), display_name: "Doubao Seed Code Preview".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "doubao-seed-1-8-251228".to_string(), display_name: "Doubao Seed 1.8".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "kimi-k2-5-260127".to_string(), display_name: "Kimi K2.5".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "glm-4-7-251222".to_string(), display_name: "GLM-4.7".to_string(), context_window: 200000, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "deepseek-v3-2-251201".to_string(), display_name: "DeepSeek V3.2".to_string(), context_window: 131072, max_tokens: 16384, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                ],
            },
            KnownProviderInfo {
                suggest_name: "zai".to_string(),
                api: "openai-completions".to_string(),
                match_urls: vec!["open.bigmodel.cn".to_string(), "bigmodel.cn".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "glm-5".to_string(), display_name: "GLM-5".to_string(), context_window: 198656, max_tokens: 32768, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "glm-4.7".to_string(), display_name: "GLM-4.7".to_string(), context_window: 198656, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "glm-4.6v".to_string(), display_name: "GLM-4.6V".to_string(), context_window: 198656, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "glm-4.6".to_string(), display_name: "GLM-4.6".to_string(), context_window: 198656, max_tokens: 16384, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "glm-4.7-flash".to_string(), display_name: "GLM-4.7 Flash".to_string(), context_window: 131072, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                ],
            },
            KnownProviderInfo {
                suggest_name: "minimax".to_string(),
                api: "anthropic-messages".to_string(),
                match_urls: vec!["api.minimax.io".to_string(), "api.minimaxi.com".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "MiniMax-M2.5".to_string(), display_name: "MiniMax M2.5".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "MiniMax-M2.5-highspeed".to_string(), display_name: "MiniMax M2.5 Highspeed".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "MiniMax-M2.7".to_string(), display_name: "MiniMax M2.7".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                    KnownModelInfo { model_id: "MiniMax-VL-01".to_string(), display_name: "MiniMax VL-01".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                ],
            },
            KnownProviderInfo {
                suggest_name: "openai".to_string(),
                api: "openai-completions".to_string(),
                match_urls: vec!["api.openai.com".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "gpt-4o".to_string(), display_name: "GPT-4o".to_string(), context_window: 128000, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "gpt-4o-mini".to_string(), display_name: "GPT-4o Mini".to_string(), context_window: 128000, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "gpt-4.1".to_string(), display_name: "GPT-4.1".to_string(), context_window: 1047576, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "gpt-4.1-mini".to_string(), display_name: "GPT-4.1 Mini".to_string(), context_window: 1047576, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "o3".to_string(), display_name: "o3".to_string(), context_window: 200000, max_tokens: 100000, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "o4-mini".to_string(), display_name: "o4 Mini".to_string(), context_window: 200000, max_tokens: 100000, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                ],
            },
            KnownProviderInfo {
                suggest_name: "anthropic".to_string(),
                api: "anthropic-messages".to_string(),
                match_urls: vec!["api.anthropic.com".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "claude-opus-4-6".to_string(), display_name: "Claude Opus 4.6".to_string(), context_window: 200000, max_tokens: 32000, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "claude-sonnet-4-6".to_string(), display_name: "Claude Sonnet 4.6".to_string(), context_window: 200000, max_tokens: 64000, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "claude-haiku-4-5".to_string(), display_name: "Claude Haiku 4.5".to_string(), context_window: 200000, max_tokens: 16000, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                ],
            },
            KnownProviderInfo {
                suggest_name: "gemini".to_string(),
                api: "gemini".to_string(),
                match_urls: vec!["generativelanguage.googleapis.com".to_string(), "googleapis.com".to_string()],
                models: vec![
                    KnownModelInfo { model_id: "gemini-2.5-pro".to_string(), display_name: "Gemini 2.5 Pro".to_string(), context_window: 1048576, max_tokens: 65536, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "gemini-2.5-flash".to_string(), display_name: "Gemini 2.5 Flash".to_string(), context_window: 1048576, max_tokens: 65536, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                    KnownModelInfo { model_id: "gemini-2.0-flash".to_string(), display_name: "Gemini 2.0 Flash".to_string(), context_window: 1048576, max_tokens: 8192, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                ],
            },
        ]
    });
    &KNOWN
}

/// 获取已知提供商配置建议（用于根据 base_url 自动识别）
#[tauri::command]
pub fn get_known_providers() -> Result<Vec<KnownProviderInfo>> {
    Ok(known_providers().to_vec())
}

/// 根据 baseUrl 推断提供商配置
#[tauri::command]
pub fn suggest_provider(base_url: String) -> Result<Option<SuggestedProvider>> {
    Ok(detect_provider(&base_url))
}

/// 根据 baseUrl 推断提供商配置
fn detect_provider(base_url: &str) -> Option<SuggestedProvider> {
    let lower = base_url.to_lowercase();
    known_providers().iter().find_map(|p| {
        if p.match_urls.iter().any(|u| lower.contains(u.as_str())) {
            Some(SuggestedProvider {
                name: p.suggest_name.clone(),
                api: p.api.clone(),
                models: p.models.clone(),
            })
        } else {
            None
        }
    })
}
