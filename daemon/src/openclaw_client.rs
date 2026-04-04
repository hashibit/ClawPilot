//! Centralized OpenClaw CLI client
//!
//! All interactions with the `openclaw` binary go through this module,
//! ensuring consistent PATH injection and error handling.

use std::process::Command;
use crate::utils::extract_json;

/// Returns an extended PATH that includes common openclaw installation directories.
pub fn extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let current = std::env::var("PATH").unwrap_or_default();
    format!(
        "{}/.npm-global/bin:{}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{}",
        home, home, current
    )
}

/// Result of `openclaw gateway status` probe
pub struct GatewayStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub rpc_ok: bool,
}

/// Query `openclaw gateway status --json`.
pub fn gateway_status() -> GatewayStatus {
    let output = Command::new("openclaw")
        .args(["gateway", "status", "--json"])
        .env("PATH", extended_path())
        .output();

    let stdout = match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
    };

    if !stdout.is_empty() {
        // May print log lines before/after JSON, extract the JSON part
        let clean_json = match extract_json(&stdout) {
            Some(j) => j,
            None => return GatewayStatus { is_running: false, pid: None, rpc_ok: false },
        };

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&clean_json) {
            let status = v["service"]["runtime"]["status"].as_str().unwrap_or("");
            let is_running = status == "running";
            let pid = v["service"]["runtime"]["pid"].as_u64().map(|p| p as u32);
            let rpc_ok = v["rpc"]["ok"].as_bool().unwrap_or(false);

            return GatewayStatus { is_running, pid, rpc_ok };
        }
    }

    GatewayStatus { is_running: false, pid: None, rpc_ok: false }
}

/// Restart the openclaw gateway.
pub fn restart_gateway() -> anyhow::Result<()> {
    let output = Command::new("openclaw")
        .args(["gateway", "restart"])
        .env("PATH", extended_path())
        .output()
        .map_err(|e| anyhow::anyhow!("failed to run openclaw gateway restart: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("openclaw gateway restart failed: {}", stderr));
    }
    Ok(())
}

/// List all registered agents via `openclaw agents list --json`.
pub async fn list_agents() -> anyhow::Result<Vec<serde_json::Value>> {
    let output = tokio::process::Command::new("openclaw")
        .args(["agents", "list", "--json"])
        .env("PATH", extended_path())
        .output()
        .await
        .map_err(|e| anyhow::anyhow!("failed to run openclaw agents list: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("openclaw agents list failed: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let clean = extract_json(&json_str)
        .ok_or_else(|| anyhow::anyhow!("no JSON in openclaw agents list output"))?;
    let v: serde_json::Value = serde_json::from_str(&clean)?;

    let arr = if let Some(arr) = v.as_array() {
        arr.clone()
    } else if let Some(arr) = v.get("agents").and_then(|a| a.as_array()) {
        arr.clone()
    } else {
        return Err(anyhow::anyhow!("unexpected agents list format"));
    };

    Ok(arr)
}

/// Spawn an openclaw agent session.
///
/// Returns a `tokio::process::Child` so the caller can manage the process.
pub fn spawn_agent(agent_id: &str) -> std::io::Result<tokio::process::Child> {
    tokio::process::Command::new("openclaw")
        .args(["agent", "--agent", agent_id])
        .env("PATH", extended_path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
}

/// Check if openclaw binary is available on PATH.
pub async fn is_available() -> bool {
    tokio::process::Command::new("openclaw")
        .arg("--version")
        .env("PATH", extended_path())
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}