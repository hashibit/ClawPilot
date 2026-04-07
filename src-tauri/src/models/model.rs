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
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub provider_name: String,
    #[serde(default)]
    pub model_id: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub context_window: i64,
    #[serde(default)]
    pub max_tokens: i64,
    /// JSON 数组字符串，如 '["text","image"]'
    #[serde(default = "default_input_types")]
    pub input_types: String,
    #[serde(default)]
    pub cost_input: f64,
    #[serde(default)]
    pub cost_output: f64,
    #[serde(default)]
    pub supports_vision: bool,
    #[serde(default)]
    pub supports_function_calling: bool,
    #[serde(default = "default_true")]
    pub supports_streaming: bool,
    #[serde(default)]
    pub is_custom: bool,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default = "default_timestamp")]
    pub updated_at: i64,
}

fn default_input_types() -> String {
    r#"["text"]"#.to_string()
}

fn default_true() -> bool {
    true
}

impl ModelInfo {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }
    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}
