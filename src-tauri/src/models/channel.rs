use serde::{Deserialize, Serialize};

/// 渠道类型，对应数据库 channel_type 列
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ChannelType {
    Feishu,
    Dingtalk,
    Wechat,
}

impl ChannelType {
    /// 转换为数据库存储字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ChannelType::Feishu => "FEISHU",
            ChannelType::Dingtalk => "DINGTALK",
            ChannelType::Wechat => "WECHAT",
        }
    }

    /// 从数据库字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "FEISHU" => Some(ChannelType::Feishu),
            "DINGTALK" => Some(ChannelType::Dingtalk),
            "WECHAT" => Some(ChannelType::Wechat),
            _ => None,
        }
    }
}

/// 飞书应用配置，存入 channels 表的 feishu_config JSON 列
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeishuConfig {
    #[serde(default)]
    pub app_id: String,
    /// 应用密钥（加密存储）
    #[serde(default)]
    pub app_secret: String,
}

/// 渠道配置，对应数据库 channels 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub opc_id: String,
    /// 必填：渠道类型
    pub channel_type: ChannelType,
    #[serde(default)]
    pub is_enabled: bool,
    /// 飞书配置（JSON），仅 channel_type == Feishu 时使用
    pub feishu_config: Option<FeishuConfig>,
    #[serde(default)]
    pub is_connected: bool,
    pub last_connected: Option<i64>,
    #[serde(default = "default_timestamp")]
    pub created_at: i64,
    #[serde(default = "default_timestamp")]
    pub updated_at: i64,
}

fn default_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

impl ChannelConfig {
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }

    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }

    /// 从 DB JSON 字符串反序列化飞书配置
    pub fn feishu_config_from_json(s: &str) -> Option<FeishuConfig> {
        serde_json::from_str(s).ok()
    }

    /// 将飞书配置序列化为 DB 存储用 JSON 字符串
    pub fn feishu_config_to_json(cfg: &FeishuConfig) -> String {
        serde_json::to_string(cfg).unwrap_or_else(|_| "{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_config_serde_roundtrip() {
        let feishu = FeishuConfig {
            app_id: "cli_abc123".to_string(),
            app_secret: "encrypted-secret-xyz".to_string(),
        };
        let channel = ChannelConfig {
            id: "channel-001".to_string(),
            opc_id: "opc-001".to_string(),
            channel_type: ChannelType::Feishu,
            is_enabled: true,
            feishu_config: Some(feishu),
            is_connected: false,
            last_connected: None,
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&channel).expect("serialize failed");
        let decoded: ChannelConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, channel.id);
        assert_eq!(decoded.channel_type, channel.channel_type);
        assert_eq!(decoded.is_enabled, channel.is_enabled);
        assert!(decoded.feishu_config.is_some());
        let fc = decoded.feishu_config.unwrap();
        assert_eq!(fc.app_id, "cli_abc123");
    }

    #[test]
    fn test_feishu_config_json_roundtrip() {
        let cfg = FeishuConfig {
            app_id: "cli_xyz".to_string(),
            app_secret: "secret-encrypted".to_string(),
        };
        let json = ChannelConfig::feishu_config_to_json(&cfg);
        let decoded = ChannelConfig::feishu_config_from_json(&json).expect("deserialize failed");
        assert_eq!(decoded.app_id, cfg.app_id);
        assert_eq!(decoded.app_secret, cfg.app_secret);
    }

    #[test]
    fn test_channel_type_roundtrip() {
        let types = [ChannelType::Feishu, ChannelType::Dingtalk, ChannelType::Wechat];
        for ct in &types {
            let s = ct.as_str();
            let parsed = ChannelType::from_str(s).expect("parse failed");
            assert_eq!(&parsed, ct);
        }
    }
}
