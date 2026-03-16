use serde::{Deserialize, Serialize};

/// 技能信息，对应数据库 skills 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
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
    /// 是否为内置技能，DB 中存 0/1
    pub is_builtin: bool,
    /// 最后同步时间（Unix 时间戳）
    pub last_synced: Option<i64>,
}

impl SkillInfo {
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
    fn test_skill_info_serde_roundtrip() {
        let skill = SkillInfo {
            id: "summarize-doc".to_string(),
            name: "Summarize Document".to_string(),
            slug: "acme/summarize-doc".to_string(),
            description: Some("Summarizes long documents into bullet points".to_string()),
            author: Some("acme".to_string()),
            size: Some(8192),
            url: Some("https://clawhub.ai/acme/summarize-doc".to_string()),
            version: Some("2.1.0".to_string()),
            tags: vec!["nlp".to_string(), "summarization".to_string()],
            category: Some("productivity".to_string()),
            downloads: 1200,
            is_builtin: false,
            last_synced: Some(1700001500),
        };

        let json = serde_json::to_string(&skill).expect("serialize failed");
        let decoded: SkillInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, skill.id);
        assert_eq!(decoded.tags, skill.tags);
        assert_eq!(decoded.is_builtin, skill.is_builtin);
        assert_eq!(decoded.downloads, skill.downloads);
        assert_eq!(decoded.version, skill.version);
    }

    #[test]
    fn test_tags_json_roundtrip() {
        let tags = vec!["code".to_string(), "review".to_string()];
        let json = SkillInfo::tags_to_json(&tags);
        let decoded = SkillInfo::tags_from_json(&json);
        assert_eq!(decoded, tags);
    }

    #[test]
    fn test_tags_json_empty() {
        let tags: Vec<String> = vec![];
        let json = SkillInfo::tags_to_json(&tags);
        let decoded = SkillInfo::tags_from_json(&json);
        assert!(decoded.is_empty());
    }

    #[test]
    fn test_tags_from_invalid_json() {
        let decoded = SkillInfo::tags_from_json("{invalid}");
        assert!(decoded.is_empty());
    }

    #[test]
    fn test_bool_i64_conversion() {
        assert!(SkillInfo::i64_to_bool(1));
        assert!(!SkillInfo::i64_to_bool(0));
        assert_eq!(SkillInfo::bool_to_i64(true), 1);
        assert_eq!(SkillInfo::bool_to_i64(false), 0);
    }
}
