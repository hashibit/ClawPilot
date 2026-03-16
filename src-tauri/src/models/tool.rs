use serde::{Deserialize, Serialize};

/// 工具信息，对应数据库 tools 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub size: Option<i32>,
    pub url: Option<String>,
    pub version: Option<String>,
    /// 标签列表，DB 中存 JSON 字符串
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub downloads: i32,
    /// 是否为内置工具，DB 中存 0/1
    pub is_builtin: bool,
    /// 最后同步时间（Unix 时间戳）
    pub last_synced: Option<i64>,
}

impl ToolInfo {
    /// 将 Vec<String> 序列化为 JSON 字符串用于 DB 存储
    pub fn tags_to_json(tags: &[String]) -> String {
        serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
    }

    /// 从 DB 的 JSON 字符串反序列化为 Vec<String>
    pub fn tags_from_json(s: &str) -> Vec<String> {
        serde_json::from_str(s).unwrap_or_default()
    }

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
    fn test_tool_info_serde_roundtrip() {
        let tool = ToolInfo {
            id: "openai-whisper-api".to_string(),
            name: "OpenAI Whisper API".to_string(),
            slug: "steipete/openai-whisper-api".to_string(),
            description: Some("Speech-to-text via OpenAI Whisper".to_string()),
            author: Some("steipete".to_string()),
            size: Some(12345),
            url: Some("https://clawhub.ai/steipete/openai-whisper-api".to_string()),
            version: Some("1.0.0".to_string()),
            tags: vec!["audio".to_string(), "speech".to_string()],
            category: Some("audio".to_string()),
            downloads: 500,
            is_builtin: false,
            last_synced: Some(1700001000),
        };

        let json = serde_json::to_string(&tool).expect("serialize failed");
        let decoded: ToolInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, tool.id);
        assert_eq!(decoded.tags, tool.tags);
        assert_eq!(decoded.is_builtin, tool.is_builtin);
        assert_eq!(decoded.downloads, tool.downloads);
    }

    #[test]
    fn test_tags_json_roundtrip() {
        let tags = vec!["nlp".to_string(), "vision".to_string(), "audio".to_string()];
        let json = ToolInfo::tags_to_json(&tags);
        let decoded = ToolInfo::tags_from_json(&json);
        assert_eq!(decoded, tags);
    }

    #[test]
    fn test_tags_json_empty() {
        let tags: Vec<String> = vec![];
        let json = ToolInfo::tags_to_json(&tags);
        let decoded = ToolInfo::tags_from_json(&json);
        assert!(decoded.is_empty());
    }

    #[test]
    fn test_tags_from_invalid_json() {
        let decoded = ToolInfo::tags_from_json("not-valid-json");
        assert!(decoded.is_empty());
    }
}
