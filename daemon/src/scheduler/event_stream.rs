//! Event stream module for receiving OpenClaw Gateway events via WebSocket
//!
//! Connects to OpenClaw Gateway WebSocket and routes events to appropriate handlers.

use anyhow::Result;
use chrono::Utc;
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Event payload from OpenClaw Gateway
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub run_id: String,
    pub seq: Option<i64>,
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    pub stream: Option<String>,
    pub ts: Option<i64>,
    pub data: Option<serde_json::Value>,
    pub session_key: Option<String>,
}

/// Activity event broadcast to clients
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub agent_id: String,
    pub run_id: String,
    pub stream: String,
    pub ts: i64,
    pub data: serde_json::Value,
}

/// Routing entry for runId -> agent_id/task_id mapping
#[derive(Debug, Clone)]
pub struct RunRoute {
    pub agent_id: String,
    pub task_id: String,
    pub plan_id: String,
}

/// Event stream client connecting to OpenClaw Gateway
pub struct EventStream {
    /// runId -> RunRoute mapping
    routes: Arc<DashMap<String, RunRoute>>,
    /// Broadcast channel for activity events
    event_tx: broadcast::Sender<ActivityEvent>,
    /// OpenClaw Gateway URL (e.g., "ws://localhost:18789")
    gateway_url: String,
    /// Token for authentication
    token: Option<String>,
}

impl EventStream {
    /// Create a new event stream client
    pub fn new(gateway_url: String, token: Option<String>) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            routes: Arc::new(DashMap::new()),
            event_tx,
            gateway_url,
            token,
        }
    }

    /// Get a clone of the event broadcast sender
    pub fn event_sender(&self) -> broadcast::Sender<ActivityEvent> {
        self.event_tx.clone()
    }

    /// Register a runId route
    pub fn register_route(&self, run_id: String, route: RunRoute) {
        tracing::info!("Registering route: run_id={} -> agent_id={}", run_id, route.agent_id);
        self.routes.insert(run_id, route);
    }

    /// Unregister a runId route
    pub fn unregister_route(&self, run_id: &str) {
        self.routes.remove(run_id);
    }

    /// Get route for a runId
    pub fn get_route(&self, run_id: &str) -> Option<RunRoute> {
        self.routes.get(run_id).map(|r| r.clone())
    }

    /// Start the WebSocket connection loop
    pub async fn start(self: Arc<Self>) {
        loop {
            match self.connect_and_listen().await {
                Ok(_) => {
                    tracing::info!("WebSocket connection closed, reconnecting...");
                }
                Err(e) => {
                    tracing::error!("WebSocket error: {}, reconnecting...", e);
                }
            }
            // Wait before reconnecting
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    }

    async fn connect_and_listen(&self) -> Result<()> {
        let url = if let Some(ref token) = self.token {
            format!("{}?token={}", self.gateway_url, token)
        } else {
            self.gateway_url.clone()
        };

        tracing::info!("Connecting to OpenClaw Gateway: {}", self.gateway_url);

        let (ws_stream, _) = connect_async(&url).await?;
        tracing::info!("WebSocket connected to OpenClaw Gateway");

        let (mut write, mut read) = ws_stream.split();

        // Send subscribe message
        let subscribe = serde_json::json!({
            "type": "subscribe",
            "channels": ["agent_events"]
        });
        write.send(Message::Text(subscribe.to_string())).await?;

        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Err(e) = self.handle_message(&text).await {
                        tracing::error!("Failed to handle message: {}", e);
                    }
                }
                Ok(Message::Ping(data)) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Ok(Message::Close(_)) => {
                    tracing::info!("WebSocket closed by server");
                    break;
                }
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }

    async fn handle_message(&self, text: &str) -> Result<()> {
        // Parse the event
        let event: AgentEvent = match serde_json::from_str(text) {
            Ok(e) => e,
            Err(e) => {
                // Try to parse as raw OpenClaw event format
                let raw: serde_json::Value = serde_json::from_str(text)?;
                if let Some(run_id) = raw.get("runId").and_then(|v| v.as_str()) {
                    AgentEvent {
                        run_id: run_id.to_string(),
                        seq: raw.get("seq").and_then(|v| v.as_i64()),
                        event_type: raw.get("type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        stream: raw.get("stream").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        ts: raw.get("ts").and_then(|v| v.as_i64()),
                        data: raw.get("data").cloned(),
                        session_key: raw.get("sessionKey").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    }
                } else {
                    tracing::debug!("Ignoring non-agent event: {}", text.chars().take(200).collect::<String>());
                    return Ok(());
                }
            }
        };

        // Look up route
        let route = match self.routes.get(&event.run_id) {
            Some(r) => r.clone(),
            None => {
                tracing::debug!("No route for run_id: {}", event.run_id);
                return Ok(());
            }
        };

        let stream = event.stream.clone()
            .or(event.event_type.clone())
            .unwrap_or_else(|| "unknown".to_string());

        tracing::debug!(
            "Event: run_id={}, agent={}, stream={}",
            event.run_id, route.agent_id, stream
        );

        // Broadcast activity event
        let activity = ActivityEvent {
            agent_id: route.agent_id.clone(),
            run_id: event.run_id.clone(),
            stream: stream.clone(),
            ts: event.ts.unwrap_or_else(|| Utc::now().timestamp()),
            data: event.data.clone().unwrap_or(serde_json::json!({})),
        };

        // Ignore broadcast errors (no subscribers is fine)
        let _ = self.event_tx.send(activity);

        // Handle lifecycle events
        if stream == "lifecycle" {
            if let Some(ref data) = event.data {
                let status = data.get("status").and_then(|v| v.as_str()).unwrap_or("");
                tracing::info!("Lifecycle event: run_id={}, status={}", event.run_id, status);
            }
        }

        Ok(())
    }
}

/// Load OpenClaw token from config file
pub fn load_openclaw_token() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let config_path = std::path::Path::new(&home)
        .join(".openclaw")
        .join("openclaw.json");

    if !config_path.exists() {
        tracing::debug!("OpenClaw config not found at {:?}", config_path);
        return None;
    }

    match std::fs::read_to_string(&config_path) {
        Ok(content) => {
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(json) => json.get("token").and_then(|t| t.as_str()).map(|s| s.to_string()),
                Err(e) => {
                    tracing::warn!("Failed to parse openclaw.json: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            tracing::warn!("Failed to read openclaw.json: {}", e);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_stream_new() {
        let stream = EventStream::new("ws://localhost:18789".to_string(), Some("test-token".to_string()));
        assert!(stream.token.is_some());
    }

    #[test]
    fn test_register_route() {
        let stream = EventStream::new("ws://localhost:18789".to_string(), None);
        stream.register_route(
            "run-123".to_string(),
            RunRoute {
                agent_id: "agent-1".to_string(),
                task_id: "task-1".to_string(),
                plan_id: "plan-1".to_string(),
            },
        );
        let route = stream.get_route("run-123").unwrap();
        assert_eq!(route.agent_id, "agent-1");
    }
}