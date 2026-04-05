//! WebSocket routes for activity streaming
//!
//! Provides `/ws/activities` endpoint for server to subscribe to agent activity events.

use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

use crate::error::Result;
use crate::state::AppState;
use crate::scheduler::ActivityEvent;

/// GET /ws/activities - WebSocket endpoint for activity events
pub async fn ws_activities(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
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