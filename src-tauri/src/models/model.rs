use serde::{Deserialize, Serialize};

/// Provider 配置，对应数据库 model_providers_v2 表（name-keyed，支持任意提供商）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    #[serde(default)]
    pub id: String,
    /// 唯一名称（用户自定义，如 "bailian", "openai-1"）
    pub name: String,
    /// API 类型：openai-completions | anthropic-messages | gemini
    pub api: String,
    pub base_url: String,
    /// API Key（加密存储，返回时已解密）
    pub api_key: Option<String>,
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default)]
    pub is_available: bool,
    pub last_tested: Option<i64>,
    #[serde(default = "default_timestamp")]
    pub created_at: i64,
    #[serde(default = "default_timestamp")]
    pub updated_at: i64,
}

fn default_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

impl ProviderConfig {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }
    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}

/// 模型信息，对应数据库 model_info_v2 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub provider_name: String,
    pub model_id: String,
    pub display_name: String,
    pub context_window: i64,
    pub max_tokens: i64,
    /// JSON 数组字符串，如 '["text","image"]'
    pub input_types: String,
    pub cost_input: f64,
    pub cost_output: f64,
    pub supports_vision: bool,
    pub supports_function_calling: bool,
    pub supports_streaming: bool,
    pub is_custom: bool,
    pub sort_order: i64,
    pub updated_at: i64,
}

impl ModelInfo {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }
    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}
