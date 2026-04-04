use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Office {
    pub id: String,
    pub name: String,
    pub address: Option<String>,
    pub access_card: Option<String>,
    pub phone: Option<String>,
    pub receptionist_image: Option<String>,
    pub ownership: String,
    pub monthly_rent: Option<f64>,
    pub internet_speed: Option<String>,
    pub decoration_grade: String,
    pub description: Option<String>,
    pub daemon_url: Option<String>,
    pub daemon_api_key: Option<String>,
    pub opc_root: Option<String>,
    // Joined from opc_config (read-only)
    pub current_opc_id: Option<String>,
    pub current_opc_name: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficeDeployment {
    pub id: String,
    pub opc_id: String,
    pub opc_name: String,
    pub office_id: String,
    pub office_name: String,
    pub deployed_at: i64,
    pub undeployed_at: Option<i64>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DaemonHealthResult {
    pub ok: bool,
    pub error: Option<String>,
    pub status: Option<String>,
    pub version: Option<String>,
    pub openclaw_status: Option<String>,
    pub openclaw_pid: Option<u32>,
    pub active_tasks: Option<u64>,
}
