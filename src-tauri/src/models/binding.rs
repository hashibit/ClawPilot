use serde::{Deserialize, Serialize};

/// 绑定频道类型（群聊/私聊），对应数据库 channel_type 列
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BindingChannelType {
    Group,
    Dm,
}

impl BindingChannelType {
    /// 转换为数据库存储字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            BindingChannelType::Group => "GROUP",
            BindingChannelType::Dm => "DM",
        }
    }

    /// 从数据库字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "GROUP" => Some(BindingChannelType::Group),
            "DM" => Some(BindingChannelType::Dm),
            _ => None,
        }
    }
}

/// 触发模式，对应数据库 trigger_mode 列
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TriggerMode {
    Mention,
    All,
}

impl TriggerMode {
    /// 转换为数据库存储字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            TriggerMode::Mention => "MENTION",
            TriggerMode::All => "ALL",
        }
    }

    /// 从数据库字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "MENTION" => Some(TriggerMode::Mention),
            "ALL" => Some(TriggerMode::All),
            _ => None,
        }
    }
}

/// 绑定规则，对应数据库 bindings 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindingRule {
    pub id: String,
    pub opc_id: String,
    pub channel_id: String,
    pub channel_name: String,
    pub channel_type: BindingChannelType,
    pub agent_id: String,
    pub agent_name: String,
    pub trigger_mode: TriggerMode,
    /// 是否启用，DB 中存 0/1
    pub is_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl BindingRule {
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
    fn test_binding_rule_serde_roundtrip() {
        let binding = BindingRule {
            id: "binding-001".to_string(),
            opc_id: "opc-001".to_string(),
            channel_id: "oc_abc123".to_string(),
            channel_name: "Engineering Group".to_string(),
            channel_type: BindingChannelType::Group,
            agent_id: "agent-001".to_string(),
            agent_name: "Alice".to_string(),
            trigger_mode: TriggerMode::Mention,
            is_enabled: true,
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&binding).expect("serialize failed");
        let decoded: BindingRule = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, binding.id);
        assert_eq!(decoded.channel_type, binding.channel_type);
        assert_eq!(decoded.trigger_mode, binding.trigger_mode);
        assert_eq!(decoded.is_enabled, binding.is_enabled);
    }

    #[test]
    fn test_binding_channel_type_roundtrip() {
        let types = [BindingChannelType::Group, BindingChannelType::Dm];
        for t in &types {
            let s = t.as_str();
            let parsed = BindingChannelType::from_str(s).expect("parse failed");
            assert_eq!(&parsed, t);
        }
    }

    #[test]
    fn test_trigger_mode_roundtrip() {
        let modes = [TriggerMode::Mention, TriggerMode::All];
        for m in &modes {
            let s = m.as_str();
            let parsed = TriggerMode::from_str(s).expect("parse failed");
            assert_eq!(&parsed, m);
        }
    }

    #[test]
    fn test_bool_i64_conversion() {
        assert!(BindingRule::i64_to_bool(1));
        assert!(!BindingRule::i64_to_bool(0));
        assert_eq!(BindingRule::bool_to_i64(true), 1);
        assert_eq!(BindingRule::bool_to_i64(false), 0);
    }
}
