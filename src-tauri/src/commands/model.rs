use tauri::State;

use crate::database::pool::DbPool;
use crate::error::Result;
use crate::models::model::{ModelInfo, ProviderConfig};
use crate::services::model_service;
use std::time::{Duration, Instant};

/// test_provider 返回结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TestProviderResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_providers(pool: State<'_, DbPool>) -> Result<Vec<ProviderConfig>> {
    model_service::get_providers(&pool)
}

#[tauri::command]
pub fn get_provider(pool: State<'_, DbPool>, id: String) -> Result<ProviderConfig> {
    model_service::get_provider(&pool, &id)
}

#[tauri::command]
pub fn create_provider(pool: State<'_, DbPool>, config: ProviderConfig) -> Result<ProviderConfig> {
    model_service::create_provider(&pool, config)
}

#[tauri::command]
pub fn update_provider(pool: State<'_, DbPool>, id: String, config: ProviderConfig) -> Result<ProviderConfig> {
    model_service::update_provider(&pool, &id, config)
}

#[tauri::command]
pub fn delete_provider(pool: State<'_, DbPool>, id: String) -> Result<()> {
    model_service::delete_provider(&pool, &id)
}

#[tauri::command]
pub fn get_models(pool: State<'_, DbPool>, provider_name: Option<String>) -> Result<Vec<ModelInfo>> {
    model_service::get_models(&pool, provider_name.as_deref())
}

#[tauri::command]
pub fn set_models(pool: State<'_, DbPool>, provider_name: String, models: Vec<ModelInfo>) -> Result<()> {
    model_service::set_models(&pool, &provider_name, models)
}

/// 实际 HTTP 连通测试（支持 openai-completions / anthropic-messages / gemini）
#[tauri::command]
pub async fn test_provider(
    pool: State<'_, DbPool>,
    base_url: String,
    api_key: String,
    api: String,
    provider_id: Option<String>,
) -> crate::error::Result<TestProviderResult> {
    let start = Instant::now();
    let result = do_test_provider(&base_url, &api_key, &api).await;
    let latency_ms = start.elapsed().as_millis() as u64;
    let ok = result.is_ok();
    let error = result.err();

    if let Some(ref pid) = provider_id {
        let _ = model_service::save_test_result(&pool, pid, ok);
    }

    Ok(TestProviderResult { ok, latency_ms, error })
}

async fn do_test_provider(base_url: &str, api_key: &str, api: &str) -> std::result::Result<(), String> {
    let base = base_url.trim_end_matches('/');
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    match api {
        "anthropic-messages" => {
            let r = client
                .get(format!("{}/models", base))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if r.status() == 404 {
                // /models not supported, probe with /messages
                let r2 = client
                    .post(format!("{}/messages", base))
                    .header("x-api-key", api_key)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .json(&serde_json::json!({
                        "model": "_ping_",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "hi"}]
                    }))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = r2.status().as_u16();
                if status == 401 || status == 403 {
                    return Err(format!("HTTP {}: API Key 无效", status));
                }
                return Ok(());
            }
            if r.status().is_success() { Ok(()) } else { Err(format!("HTTP {}", r.status())) }
        }
        "gemini" => {
            let r = client
                .get(format!("{}/models", base))
                .query(&[("key", api_key)])
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if r.status().is_success() { Ok(()) } else { Err(format!("HTTP {}", r.status())) }
        }
        _ => {
            // openai-completions compatible
            let r = client
                .get(format!("{}/models", base))
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if r.status() == 404 {
                let r2 = client
                    .post(format!("{}/chat/completions", base))
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("content-type", "application/json")
                    .json(&serde_json::json!({
                        "model": "_ping_",
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 1
                    }))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = r2.status().as_u16();
                if status == 401 || status == 403 {
                    return Err(format!("HTTP {}: API Key 无效", status));
                }
                return Ok(());
            }
            if r.status().is_success() { Ok(()) } else { Err(format!("HTTP {}", r.status())) }
        }
    }
}

// ── Known providers (hardcoded, for auto-detection) ──────────────────────────

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
    pub context_window: i64,
    pub max_tokens: i64,
    pub input_types: String,
    pub supports_vision: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SuggestedProvider {
    pub name: String,
    pub api: String,
    pub models: Vec<KnownModelInfo>,
}

fn known_providers() -> &'static [KnownProviderInfo] {
    use once_cell::sync::Lazy;
    static KNOWN: Lazy<Vec<KnownProviderInfo>> = Lazy::new(|| vec![
        KnownProviderInfo {
            suggest_name: "bailian".to_string(),
            api: "openai-completions".to_string(),
            match_urls: vec!["dashscope.aliyuncs.com".to_string(), "coding.dashscope.aliyuncs.com".to_string(), "coding-intl.dashscope.aliyuncs.com".to_string()],
            models: vec![
                KnownModelInfo { model_id: "qwen3.5-plus".to_string(), display_name: "Qwen3.5 Plus".to_string(), context_window: 1000000, max_tokens: 65536, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                KnownModelInfo { model_id: "qwen3-max-2026-01-23".to_string(), display_name: "Qwen3 Max".to_string(), context_window: 262144, max_tokens: 65536, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                KnownModelInfo { model_id: "qwen3-coder-plus".to_string(), display_name: "Qwen3 Coder Plus".to_string(), context_window: 1000000, max_tokens: 65536, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                KnownModelInfo { model_id: "kimi-k2.5".to_string(), display_name: "Kimi K2.5".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
            ],
        },
        KnownProviderInfo {
            suggest_name: "volcengine".to_string(),
            api: "openai-completions".to_string(),
            match_urls: vec!["ark.cn-beijing.volces.com".to_string()],
            models: vec![
                KnownModelInfo { model_id: "doubao-seed-code-preview-251028".to_string(), display_name: "Doubao Seed Code Preview".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                KnownModelInfo { model_id: "doubao-seed-1-8-251228".to_string(), display_name: "Doubao Seed 1.8".to_string(), context_window: 262144, max_tokens: 32768, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
                KnownModelInfo { model_id: "deepseek-v3-2-251201".to_string(), display_name: "DeepSeek V3.2".to_string(), context_window: 131072, max_tokens: 16384, input_types: r#"["text"]"#.to_string(), supports_vision: false },
            ],
        },
        KnownProviderInfo {
            suggest_name: "openai".to_string(),
            api: "openai-completions".to_string(),
            match_urls: vec!["api.openai.com".to_string()],
            models: vec![
                KnownModelInfo { model_id: "gpt-4o".to_string(), display_name: "GPT-4o".to_string(), context_window: 128000, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
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
        KnownProviderInfo {
            suggest_name: "minimax".to_string(),
            api: "anthropic-messages".to_string(),
            match_urls: vec!["api.minimax.io".to_string(), "api.minimaxi.com".to_string()],
            models: vec![
                KnownModelInfo { model_id: "MiniMax-M2.5".to_string(), display_name: "MiniMax M2.5".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                KnownModelInfo { model_id: "MiniMax-M2.7".to_string(), display_name: "MiniMax M2.7".to_string(), context_window: 200000, max_tokens: 8192, input_types: r#"["text"]"#.to_string(), supports_vision: false },
            ],
        },
        KnownProviderInfo {
            suggest_name: "zai".to_string(),
            api: "openai-completions".to_string(),
            match_urls: vec!["open.bigmodel.cn".to_string(), "bigmodel.cn".to_string()],
            models: vec![
                KnownModelInfo { model_id: "glm-5".to_string(), display_name: "GLM-5".to_string(), context_window: 198656, max_tokens: 32768, input_types: r#"["text"]"#.to_string(), supports_vision: false },
                KnownModelInfo { model_id: "glm-4.7".to_string(), display_name: "GLM-4.7".to_string(), context_window: 198656, max_tokens: 16384, input_types: r#"["text","image"]"#.to_string(), supports_vision: true },
            ],
        },
    ]);
    &KNOWN
}

#[tauri::command]
pub fn get_known_providers() -> Result<Vec<KnownProviderInfo>> {
    Ok(known_providers().to_vec())
}

#[tauri::command]
pub fn suggest_provider(pool: State<'_, DbPool>, base_url: String) -> Result<Option<SuggestedProvider>> {
    let lower = base_url.to_lowercase();
    let matched = known_providers().iter().find(|p| {
        p.match_urls.iter().any(|u| lower.contains(u.as_str()))
    });

    let Some(matched) = matched else {
        return Ok(None);
    };

    // Find a unique name (add numeric suffix if already taken)
    let conn = pool.get()?;
    let mut name = matched.suggest_name.clone();
    let mut suffix = 2u32;
    loop {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM model_providers_v2 WHERE name = ?1",
            rusqlite::params![name],
            |r| r.get(0),
        )?;
        if count == 0 { break; }
        name = format!("{}-{}", matched.suggest_name, suffix);
        suffix += 1;
    }

    Ok(Some(SuggestedProvider {
        name,
        api: matched.api.clone(),
        models: matched.models.clone(),
    }))
}
