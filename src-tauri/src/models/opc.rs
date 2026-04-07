use serde::{Deserialize, Serialize};

/// OPC (OpenClaw 团队) 统计数据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpcStats {
    #[serde(default)]
    pub agent_count: i32,
    #[serde(default)]
    pub channel_count: i32,
    #[serde(default)]
    pub group_count: i32,
    #[serde(default)]
    pub dm_count: i32,
    #[serde(default)]
    pub message_count_today: i64,
    #[serde(default)]
    pub message_growth: f64,
}

/// OPC (OpenClaw 团队) 完整配置，对应数据库 opc_config 表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpcConfig {
    /// 后端自动生成
    #[serde(default)]
    pub id: String,
    /// 必填：团队名称（slug）
    pub name: String,
    /// 必填：显示名称
    pub display_name: String,
    pub description: Option<String>,
    pub avatar_color: Option<String>,
    pub avatar_initials: Option<String>,
    /// 后端管理
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_running: bool,
    #[serde(default)]
    pub agent_count: i32,
    #[serde(default)]
    pub channel_count: i32,
    #[serde(default)]
    pub message_count_today: i64,
    #[serde(default)]
    pub message_growth: f64,
    pub office_id: Option<String>,
    pub office_name: Option<String>,
    #[serde(default = "default_timestamp")]
    pub created_at: i64,
    #[serde(default = "default_timestamp")]
    pub updated_at: i64,
}

fn default_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

impl OpcConfig {
    /// 从 SQLite 返回的 i64 (0/1) 转换为 bool
    pub fn i64_to_bool(v: i64) -> bool {
        v != 0
    }

    /// 将 bool 转换为 SQLite 存储用的 i64
    pub fn bool_to_i64(v: bool) -> i64 {
        if v { 1 } else { 0 }
    }

    /// 构建 OpcStats 子集
    pub fn stats(&self) -> OpcStats {
        OpcStats {
            agent_count: self.agent_count,
            channel_count: self.channel_count,
            group_count: 0,
            dm_count: 0,
            message_count_today: self.message_count_today,
            message_growth: self.message_growth,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opc_config_serde_roundtrip() {
        let opc = OpcConfig {
            id: "opc-001".to_string(),
            name: "my-team".to_string(),
            display_name: "My Team".to_string(),
            description: Some("Test team".to_string()),
            avatar_color: Some("#FF5733".to_string()),
            avatar_initials: Some("MT".to_string()),
            is_active: true,
            is_running: false,
            agent_count: 3,
            channel_count: 2,
            message_count_today: 150,
            message_growth: 12.5,
            office_id: None,
            office_name: None,
            created_at: 1700000000,
            updated_at: 1700001000,
        };

        let json = serde_json::to_string(&opc).expect("serialize failed");
        let decoded: OpcConfig = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, opc.id);
        assert_eq!(decoded.is_active, opc.is_active);
        assert_eq!(decoded.is_running, opc.is_running);
        assert_eq!(decoded.message_count_today, opc.message_count_today);
        assert!((decoded.message_growth - opc.message_growth).abs() < f64::EPSILON);
    }

    #[test]
    fn test_i64_bool_conversion() {
        assert!(OpcConfig::i64_to_bool(1));
        assert!(!OpcConfig::i64_to_bool(0));
        assert_eq!(OpcConfig::bool_to_i64(true), 1);
        assert_eq!(OpcConfig::bool_to_i64(false), 0);
    }

    #[test]
    fn test_opc_stats() {
        let opc = OpcConfig {
            id: "opc-002".to_string(),
            name: "demo".to_string(),
            display_name: "Demo".to_string(),
            description: None,
            avatar_color: None,
            avatar_initials: None,
            is_active: true,
            is_running: true,
            agent_count: 5,
            channel_count: 1,
            message_count_today: 42,
            message_growth: 3.0,
            office_id: None,
            office_name: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };
        let stats = opc.stats();
        assert_eq!(stats.agent_count, 5);
        assert_eq!(stats.channel_count, 1);
        assert_eq!(stats.message_count_today, 42);
    }
}
