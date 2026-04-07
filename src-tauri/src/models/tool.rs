use serde::{Deserialize, Serialize};

/// 工具信息，对应数据库 tools 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    /// 后端自动生成（DB 自增）
    #[serde(default)]
    pub id: i64,
    /// 必填：工具名称
    pub name: String,
    /// 必填：显示名称
    pub display_name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default = "default_timestamp")]
    pub created_at: i64,
}

fn default_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

impl ToolInfo {
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
            id: 1,
            name: "search".to_string(),
            display_name: "Search".to_string(),
            description: Some("Web search tool".to_string()),
            category: Some("general".to_string()),
            is_local: true,
            created_at: 1700001000,
        };

        let json = serde_json::to_string(&tool).expect("serialize failed");
        let decoded: ToolInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, tool.id);
        assert_eq!(decoded.name, tool.name);
        assert_eq!(decoded.is_local, tool.is_local);
    }

    #[test]
    fn test_bool_i64_conversion() {
        assert!(ToolInfo::i64_to_bool(1));
        assert!(!ToolInfo::i64_to_bool(0));
        assert_eq!(ToolInfo::bool_to_i64(true), 1);
        assert_eq!(ToolInfo::bool_to_i64(false), 0);
    }
}
