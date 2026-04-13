/// Daemon 安装结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DaemonInstallResult {
    pub ok: bool,
    pub logs: Vec<String>,
    pub daemon_url: Option<String>,
    pub error: Option<String>,
}
