use serde::{Deserialize, Serialize};

/// Agent 文档类型，对应 agent_documents 表的 document_type 列
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DocumentType {
    Soul,
    Identity,
    Agents,
    User,
    Memory,
    Heartbeat,
    Tools,
}

impl DocumentType {
    /// 转换为数据库存储字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentType::Soul => "SOUL",
            DocumentType::Identity => "IDENTITY",
            DocumentType::Agents => "AGENTS",
            DocumentType::User => "USER",
            DocumentType::Memory => "MEMORY",
            DocumentType::Heartbeat => "HEARTBEAT",
            DocumentType::Tools => "TOOLS",
        }
    }

    /// 从数据库字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "SOUL" => Some(DocumentType::Soul),
            "IDENTITY" => Some(DocumentType::Identity),
            "AGENTS" => Some(DocumentType::Agents),
            "USER" => Some(DocumentType::User),
            "MEMORY" => Some(DocumentType::Memory),
            "HEARTBEAT" => Some(DocumentType::Heartbeat),
            "TOOLS" => Some(DocumentType::Tools),
            _ => None,
        }
    }
}

/// Agent 文档，对应 agent_documents 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDocument {
    pub agent_id: String,
    pub document_type: DocumentType,
    pub content: String,
}

/// Agent 完整配置，对应数据库 agents 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub opc_id: String,
    pub name: String,
    pub display_name: String,
    pub job_title: Option<String>,
    pub personality: Option<String>,
    pub description: Option<String>,
    pub initials: Option<String>,
    pub gradient_start: Option<String>,
    pub gradient_end: Option<String>,
    /// 是否默认响应者，DB 中存 0/1
    pub is_default: bool,
    pub order_index: i32,
    pub model_provider: Option<String>,
    pub model_name: Option<String>,
    /// 统一模型标识，如 "anthropic/claude-opus-4-5"（优先于 model_provider+model_name）
    pub model: Option<String>,
    /// 启用的工具 ID 列表，DB 中存 JSON 字符串
    pub enabled_tools: Vec<String>,
    /// 禁用的工具 ID 列表，DB 中存 JSON 字符串
    pub disabled_tools: Vec<String>,
    /// 启用的 Skill slug 列表，DB 中存 JSON 字符串
    pub enabled_skills: Vec<String>,
    /// 护栏规则，DB 中存 JSON 字符串
    pub guardrail_rules: Vec<String>,
    /// 汇报给哪些 Agent ID，DB 中存 JSON 字符串
    pub reports_to: Vec<String>,
    /// 管理哪些 Agent ID，DB 中存 JSON 字符串
    pub manages: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl AgentConfig {
    /// 将 Vec<String> 序列化为 JSON 字符串用于 DB 存储
    pub fn vec_to_json(v: &[String]) -> String {
        serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string())
    }

    /// 从 DB 的 JSON 字符串反序列化为 Vec<String>
    pub fn json_to_vec(s: &str) -> Vec<String> {
        serde_json::from_str(s).unwrap_or_default()
    }

    /// 从 i64 (0/1) 转换为 bool
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }

    /// 将 bool 转换为 i64 存储值
    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_config_serde_roundtrip() {
        let agent = AgentConfig {
            id: "agent-001".to_string(),
            opc_id: "opc-001".to_string(),
            name: "alice".to_string(),
            display_name: "Alice".to_string(),
            job_title: Some("Engineer".to_string()),
            personality: Some("Curious".to_string()),
            description: Some("A helpful agent".to_string()),
            initials: Some("AL".to_string()),
            gradient_start: Some("#FF0000".to_string()),
            gradient_end: Some("#0000FF".to_string()),
            is_default: true,
            order_index: 0,
            model_provider: Some("BAILIAN".to_string()),
            model_name: Some("qwen-max".to_string()),
            model: Some("bailian/qwen-max".to_string()),
            enabled_tools: vec!["tool-a".to_string(), "tool-b".to_string()],
            disabled_tools: vec![],
            enabled_skills: vec!["skill-x".to_string()],
            guardrail_rules: vec![],
            reports_to: vec!["agent-000".to_string()],
            manages: vec!["agent-002".to_string()],
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&agent).expect("serialize failed");
        let decoded: AgentConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, agent.id);
        assert_eq!(decoded.is_default, agent.is_default);
        assert_eq!(decoded.enabled_tools, agent.enabled_tools);
        assert_eq!(decoded.manages, agent.manages);
    }

    #[test]
    fn test_vec_json_roundtrip() {
        let items = vec!["foo".to_string(), "bar".to_string(), "baz".to_string()];
        let json = AgentConfig::vec_to_json(&items);
        let decoded = AgentConfig::json_to_vec(&json);
        assert_eq!(decoded, items);
    }

    #[test]
    fn test_vec_json_empty() {
        let items: Vec<String> = vec![];
        let json = AgentConfig::vec_to_json(&items);
        let decoded = AgentConfig::json_to_vec(&json);
        assert!(decoded.is_empty());
    }

    #[test]
    fn test_document_type_roundtrip() {
        let doc_types = [
            DocumentType::Soul,
            DocumentType::Identity,
            DocumentType::Agents,
            DocumentType::User,
            DocumentType::Memory,
            DocumentType::Heartbeat,
            DocumentType::Tools,
        ];
        for dt in &doc_types {
            let s = dt.as_str();
            let parsed = DocumentType::from_str(s).expect("parse failed");
            assert_eq!(&parsed, dt);
        }
    }

    #[test]
    fn test_agent_document_serde_roundtrip() {
        let doc = AgentDocument {
            agent_id: "agent-001".to_string(),
            document_type: DocumentType::Soul,
            content: "You are a helpful assistant.".to_string(),
        };
        let json = serde_json::to_string(&doc).expect("serialize failed");
        let decoded: AgentDocument = serde_json::from_str(&json).expect("deserialize failed");
        assert_eq!(decoded.agent_id, doc.agent_id);
        assert_eq!(decoded.document_type, doc.document_type);
        assert_eq!(decoded.content, doc.content);
    }
}
