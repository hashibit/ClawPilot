use serde::{Deserialize, Serialize};

/// 技能信息，对应数据库 skills 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub id: i64,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub slug: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    /// 标签列表，DB 中存 JSON 字符串
    pub tags: Vec<String>,
    pub url: Option<String>,
    pub download_url: Option<String>,
    pub is_local: bool,
    pub is_installed: bool,
    pub install_path: Option<String>,
    pub installed_at: Option<i64>,
    pub created_at: i64,
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
            id: 1,
            name: "summarize-doc".to_string(),
            display_name: "Summarize Document".to_string(),
            description: Some("Summarizes long documents into bullet points".to_string()),
            category: Some("productivity".to_string()),
            slug: Some("acme/summarize-doc".to_string()),
            version: Some("2.1.0".to_string()),
            author: Some("acme".to_string()),
            tags: vec!["nlp".to_string(), "summarization".to_string()],
            url: Some("https://clawhub.ai/acme/summarize-doc".to_string()),
            download_url: None,
            is_local: false,
            is_installed: true,
            install_path: Some("/path/to/skill".to_string()),
            installed_at: Some(1700001500),
            created_at: 1700001000,
        };

        let json = serde_json::to_string(&skill).expect("serialize failed");
        let decoded: SkillInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, skill.id);
        assert_eq!(decoded.tags, skill.tags);
        assert_eq!(decoded.is_local, skill.is_local);
        assert_eq!(decoded.is_installed, skill.is_installed);
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
