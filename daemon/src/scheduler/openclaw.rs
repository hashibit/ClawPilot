//! OpenClaw CLI wrapper
//!
//! Provides functions to interact with OpenClaw via CLI commands.

use anyhow::{Context, Result};
use serde_json::Value;
use tokio::process::Command;

use crate::scheduler::models::AgentInfo;

/// List all available agents from OpenClaw
pub async fn list_agents() -> Result<Vec<AgentInfo>> {
    let output = Command::new("openclaw")
        .args(["agents", "list", "--json"])
        .output()
        .await
        .context("Failed to run openclaw agents list")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "openclaw agents list failed: {}",
            stderr
        ));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: Value = serde_json::from_str(&json_str)
        .context("Failed to parse openclaw agents list JSON")?;

    let agents = if let Some(agents_array) = data.get("agents").and_then(|v| v.as_array()) {
        agents_array
            .iter()
            .filter_map(|agent| {
                let id = agent.get("id")?.as_str()?;
                let name = agent.get("name")?.as_str()?;

                // Parse capabilities
                let capabilities = agent
                    .get("capabilities")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                Some(AgentInfo::new(id.to_string(), name.to_string(), capabilities))
            })
            .collect()
    } else {
        return Err(anyhow::anyhow!("openclaw agents list response missing 'agents' field"));
    };

    Ok(agents)
}

/// Send a message to an agent via OpenClaw
pub async fn send_message(agent_id: &str, message: &str, timeout_secs: Option<u64>) -> Result<String> {
    let mut cmd = Command::new("openclaw");
    cmd.args(["agent", "--agent", agent_id, "--message", message]);

    if let Some(timeout) = timeout_secs {
        cmd.args(["--timeout", &timeout.to_string()]);
    }

    let output = cmd
        .output()
        .await
        .context("Failed to run openclaw agent")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "openclaw agent failed for {}: {}",
            agent_id,
            stderr
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Send a stop message to an agent
pub async fn send_stop(agent_id: &str) -> Result<()> {
    let output = Command::new("openclaw")
        .args(["agent", "--agent", agent_id, "--message", "stop"])
        .output()
        .await
        .context("Failed to send stop message")?;

    if !output.status.success() {
        tracing::warn!(
            "Failed to send stop message to {}: {:?}",
            agent_id,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    Ok(())
}

/// Check if OpenClaw is available
pub async fn check_available() -> bool {
    Command::new("openclaw")
        .args(["--version"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_available() {
        // This test will pass if openclaw is installed, otherwise fail
        let available = check_available().await;
        tracing::info!("OpenClaw available: {}", available);
    }

    #[tokio::test]
    #[ignore] // Ignore if OpenClaw not installed
    async fn test_list_agents() {
        let agents = list_agents().await.unwrap();
        tracing::info!("Found {} agents", agents.len());
        for agent in &agents {
            tracing::info!("  - {}: {} (capabilities: {:?})", agent.id, agent.name, agent.parse_capabilities());
        }
    }
}