use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Office {
    /// 后端自动生成
    #[serde(default)]
    pub id: String,
    /// 必填：办公室名称
    pub name: String,
    pub address: Option<String>,
    pub access_card: Option<String>,
    pub phone: Option<String>,
    pub receptionist_image: Option<String>,
    /// 必填：所有权类型
    pub ownership: String,
    pub monthly_rent: Option<f64>,
    pub internet_speed: Option<String>,
    /// 必填：装修等级
    pub decoration_grade: String,
    pub description: Option<String>,
    pub access_auth_type: Option<String>,
    pub access_user: Option<String>,
    pub access_password: Option<String>,
    pub ssh_key_path: Option<String>,
    pub daemon_url: Option<String>,
    pub daemon_api_key: Option<String>,
    pub opc_root: Option<String>,
    #[serde(skip_serializing)]
    pub initial_openclaw_config: Option<String>,
    // Joined from opc_config (read-only)
    pub current_opc_id: Option<String>,
    pub current_opc_name: Option<String>,
    #[serde(default = "default_timestamp")]
    pub created_at: i64,
    #[serde(default = "default_timestamp")]
    pub updated_at: i64,
}

fn default_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficeDeployment {
    /// 后端自动生成
    #[serde(default)]
    pub id: String,
    pub opc_id: String,
    pub opc_name: String,
    pub office_id: String,
    pub office_name: String,
    #[serde(default = "default_timestamp")]
    pub deployed_at: i64,
    pub undeployed_at: Option<i64>,
    #[serde(default)]
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DaemonHealthResult {
    pub ok: bool,
    pub error: Option<String>,
    pub not_installed: Option<bool>,
    pub status: Option<String>,
    pub version: Option<String>,
    pub openclaw_status: Option<String>,
    pub openclaw_pid: Option<u32>,
    pub active_tasks: Option<u64>,
}
