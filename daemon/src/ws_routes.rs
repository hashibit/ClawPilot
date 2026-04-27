//! WebSocket routes for activity streaming
//!
//! Provides `/ws/activities` endpoint for server to subscribe to agent activity events.

use axum::{
    extract::{Query, State, ws::{Message, WebSocket, WebSocketUpgrade}},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;

use crate::error::Result;
use crate::state::AppState;
use crate::scheduler::ActivityEvent;

#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    /// Bearer-equivalent token. Required because the browser WebSocket API
    /// (W3C spec) does not allow custom request headers, so we authenticate
    /// the upgrade via query string instead.
    #[serde(default)]
    token: String,
}

/// GET /ws/activities?token=<bearer> — WebSocket endpoint for activity events.
///
/// Auth: validates `?token=` against the daemon bearer token in constant time.
/// This route is intentionally exempt from the HTTP Bearer middleware because
/// browsers cannot attach an `Authorization` header to WebSocket connects.
pub async fn ws_activities(
    State(state): State<AppState>,
    Query(q): Query<WsAuthQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let expected = match state.bearer_token.as_deref() {
        Some(t) if !t.is_empty() => t,
        _ => {
            tracing::error!("[ws] bearer_token not configured in state; rejecting WS upgrade");
            return (StatusCode::UNAUTHORIZED, "auth not configured").into_response();
        }
    };
    if !constant_time_eq(q.token.as_bytes(), expected.as_bytes()) {
        return (StatusCode::UNAUTHORIZED, "invalid token").into_response();
    }
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn handle_ws(socket: WebSocket, state: AppState) {
    let (mut tx, mut rx) = socket.split();

    // Get activity sender from state
    let activity_tx = match &state.activity_tx {
        Some(tx) => tx.clone(),
        None => {
            tracing::error!("Activity sender not initialized");
            let _ = tx.send(Message::Close(None)).await;
            return;
        }
    };

    // Subscribe to activity events
    let mut activity_rx = activity_tx.subscribe();

    tracing::info!("WebSocket client connected to /ws/activities");

    // Spawn task to receive messages from client (mainly for close detection)
    let recv_task = async move {
        while let Some(msg) = rx.next().await {
            match msg {
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    };

    // Spawn task to send activity events to client
    let send_task = async move {
        loop {
            match activity_rx.recv().await {
                Ok(event) => {
                    let json = match serde_json::to_string(&event) {
                        Ok(j) => j,
                        Err(e) => {
                            tracing::error!("Failed to serialize activity event: {}", e);
                            continue;
                        }
                    };
                    if tx.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("WebSocket client lagged by {} messages", n);
                }
            }
        }
    };

    // Run both tasks concurrently
    tokio::select! {
        _ = recv_task => {},
        _ = send_task => {},
    }

    tracing::info!("WebSocket client disconnected from /ws/activities");
}