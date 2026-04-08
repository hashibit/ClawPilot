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
pub async fn get_providers(pool: State<'_, DbPool>) -> Result<Vec<ProviderConfig>> {
    tracing::info!("get_providers called");
    let result = model_service::get_providers(&pool);
    tracing::info!("get_providers returned {} items", result.as_ref().map(|v| v.len()).unwrap_or(0));
    result
}

#[tauri::command]
pub async fn get_provider(pool: State<'_, DbPool>, id: String) -> Result<ProviderConfig> {
    model_service::get_provider(&pool, &id)
}

#[tauri::command]
pub async fn create_provider(
    pool: State<'_, DbPool>,
    config: ProviderConfig,
) -> Result<ProviderConfig> {
    tracing::info!("create_provider called with name={}, api={}", config.name, config.api);
    let new_config = ProviderConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: config.name,
        api: config.api,
        base_url: config.base_url,
        api_key: config.api_key,
        is_enabled: true,
        is_available: config.is_available,
        last_tested: config.last_tested,
        created_at: chrono::Utc::now().timestamp(),
        updated_at: chrono::Utc::now().timestamp(),
    };
    let result = model_service::create_provider(&pool, new_config.clone());
    tracing::info!("create_provider result: {:?}", result.is_ok());
    result
}

#[tauri::command]
pub async fn update_provider(
    pool: State<'_, DbPool>,
    id: String,
    name: Option<String>,
    api: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    is_enabled: Option<bool>,
) -> Result<ProviderConfig> {
    model_service::update_provider_partial(&pool, &id, name, api, base_url, api_key, is_enabled)
}

#[tauri::command]
pub async fn delete_provider(pool: State<'_, DbPool>, id: String) -> Result<()> {
    model_service::delete_provider(&pool, &id)
}

#[tauri::command]
pub async fn get_models(pool: State<'_, DbPool>, provider_name: Option<String>) -> Result<Vec<ModelInfo>> {
    model_service::get_models(&pool, provider_name.as_deref())
}

#[tauri::command]
pub async fn set_models(pool: State<'_, DbPool>, provider_name: String, models: Vec<ModelInfo>) -> Result<()> {
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

            let status = r.status().as_u16();
            if status == 401 || status == 403 {
                return Err(format!("HTTP {}: API Key 无效", status));
            }
            Ok(())
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

            let status = r.status().as_u16();
            if status == 401 || status == 403 {
                return Err(format!("HTTP {}: API Key 无效", status));
            }
            Ok(())
        }
    }
}

// ── Known providers (loaded from bundle/known-providers.json at compile time) ──────────────────────────

/// JSON source format (camelCase keys)
#[derive(Debug, Clone, serde::Deserialize)]
struct ProviderJson {
    #[serde(rename = "matchUrls")]
    match_urls: Vec<String>,
    #[serde(rename = "suggestName")]
    suggest_name: String,
    api: String,
    models: Vec<ModelJson>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct ModelJson {
    #[serde(rename = "modelId")]
    model_id: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "contextWindow")]
    context_window: i64,
    #[serde(rename = "maxTokens")]
    max_tokens: i64,
    #[serde(rename = "inputTypes")]
    input_types: Vec<String>,
    #[serde(rename = "supportsVision")]
    supports_vision: bool,
}

/// 用于返回给前端的已知 provider 信息（snake_case 以匹配前端类型）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KnownProviderInfo {
    pub suggest_name: String,
    pub api: String,
    pub match_urls: Vec<String>,
    pub models: Vec<KnownModelInfo>,
}

/// 用于返回给前端的已知模型信息（snake_case 以匹配 ModelInfo 类型）
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
    static KNOWN: Lazy<Vec<KnownProviderInfo>> = Lazy::new(|| {
        // Read from OUT_DIR (copied by build.rs from bundle/known-providers.json)
        let raw = include_str!(concat!(env!("OUT_DIR"), "/known-providers.json"));
        let data: serde_json::Value = serde_json::from_str(raw)
            .expect("Failed to parse known-providers.json");
        let providers: Vec<ProviderJson> = serde_json::from_value(data["providers"].clone())
            .expect("Failed to parse providers array");
        providers.into_iter().map(|p| KnownProviderInfo {
            suggest_name: p.suggest_name,
            api: p.api,
            match_urls: p.match_urls,
            models: p.models.into_iter().map(|m| KnownModelInfo {
                model_id: m.model_id,
                display_name: m.display_name,
                context_window: m.context_window,
                max_tokens: m.max_tokens,
                input_types: serde_json::to_string(&m.input_types).unwrap_or_else(|_| r#"["text"]"#.to_string()),
                supports_vision: m.supports_vision,
            }).collect(),
        }).collect()
    });
    &KNOWN
}

#[tauri::command]
pub async fn get_known_providers() -> Result<Vec<KnownProviderInfo>> {
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
