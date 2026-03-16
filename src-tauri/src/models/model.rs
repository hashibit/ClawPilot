use serde::{Deserialize, Serialize};

/// 模型提供商类型，对应数据库 provider_type 列
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ProviderType {
    Bailian,
    Volcengine,
    Minimax,
}

impl ProviderType {
    /// 转换为数据库存储字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderType::Bailian => "BAILIAN",
            ProviderType::Volcengine => "VOLCENGINE",
            ProviderType::Minimax => "MINIMAX",
        }
    }

    /// 从数据库字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "BAILIAN" => Some(ProviderType::Bailian),
            "VOLCENGINE" => Some(ProviderType::Volcengine),
            "MINIMAX" => Some(ProviderType::Minimax),
            _ => None,
        }
    }
}

/// Provider 配置，对应数据库 model_providers 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub provider_type: ProviderType,
    /// API Key（加密存储）
    pub api_key: Option<String>,
    pub endpoint: Option<String>,
    /// 是否启用，DB 中存 0/1
    pub is_enabled: bool,
    /// 是否可用（最近测试结果），DB 中存 0/1
    pub is_available: bool,
    pub last_tested: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ProviderConfig {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }

    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}

/// 模型信息，对应数据库 model_info 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub provider_type: ProviderType,
    pub context_window: i32,
    pub input_price: f64,
    pub output_price: f64,
    /// 是否支持视觉，DB 中存 0/1
    pub supports_vision: bool,
    /// 是否支持函数调用，DB 中存 0/1
    pub supports_function_calling: bool,
    /// 是否支持流式输出，DB 中存 0/1
    pub supports_streaming: bool,
}

impl ModelInfo {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }

    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_config_serde_roundtrip() {
        let provider = ProviderConfig {
            id: "provider-001".to_string(),
            provider_type: ProviderType::Bailian,
            api_key: Some("encrypted-key-abc123".to_string()),
            endpoint: Some("https://dashscope.aliyuncs.com".to_string()),
            is_enabled: true,
            is_available: true,
            last_tested: Some(1700001000),
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&provider).expect("serialize failed");
        let decoded: ProviderConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, provider.id);
        assert_eq!(decoded.provider_type, provider.provider_type);
        assert_eq!(decoded.is_enabled, provider.is_enabled);
        assert_eq!(decoded.is_available, provider.is_available);
    }

    #[test]
    fn test_model_info_serde_roundtrip() {
        let model = ModelInfo {
            id: "model-001".to_string(),
            name: "qwen-max".to_string(),
            display_name: "Qwen Max".to_string(),
            provider_type: ProviderType::Bailian,
            context_window: 8192,
            input_price: 0.04,
            output_price: 0.12,
            supports_vision: false,
            supports_function_calling: true,
            supports_streaming: true,
        };

        let json = serde_json::to_string(&model).expect("serialize failed");
        let decoded: ModelInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, model.id);
        assert_eq!(decoded.provider_type, model.provider_type);
        assert_eq!(decoded.context_window, model.context_window);
        assert!(decoded.supports_function_calling);
        assert!(!decoded.supports_vision);
    }

    #[test]
    fn test_provider_type_roundtrip() {
        let types = [
            ProviderType::Bailian,
            ProviderType::Volcengine,
            ProviderType::Minimax,
        ];
        for pt in &types {
            let s = pt.as_str();
            let parsed = ProviderType::from_str(s).expect("parse failed");
            assert_eq!(&parsed, pt);
        }
    }

    #[test]
    fn test_bool_i64_conversion() {
        assert!(ProviderConfig::i64_to_bool(1));
        assert!(!ProviderConfig::i64_to_bool(0));
        assert_eq!(ProviderConfig::bool_to_i64(true), 1);
        assert_eq!(ProviderConfig::bool_to_i64(false), 0);
    }
}
