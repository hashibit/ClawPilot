//! HTTP routing layer for ClawPilot.
//!
//! Exposes all Tauri commands as POST /api/{command_name} endpoints so that
//! the React frontend can reach the Rust backend over plain HTTP during
//! development (when `__TAURI_INTERNALS__` is absent) and in future
//! standalone-server deployments.
//!
//! All handlers accept a JSON body and return JSON.  Errors from the service
//! layer are mapped to appropriate HTTP status codes via the `IntoResponse`
//! impl on `AppError`.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde_json::Value;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;

use crate::commands::office::{
    InstallDaemonResult, SshAuthResult, SshConnectionResult, SshTunnel, TunnelPool,
};
use crate::commands::model::{KnownProviderInfo, SuggestedProvider, TestProviderResult};
use crate::commands::process::ProcessStatusResponse;
use crate::commands::settings::LicenseStatus;
use crate::commands::ai::{AiGeneratedAgent, ChatMessage, ChatResponse};
use crate::commands::agent::AgentDocument;
use crate::database::pool::DbPool;
use crate::error::AppError;
use crate::models::agent::AgentConfig;
use crate::models::binding::BindingRule;
use crate::models::channel::ChannelConfig;
use crate::models::model::{ModelInfo, ProviderConfig};
use crate::models::office::{DaemonHealthResult, Office, OfficeDeployment};
use crate::models::opc::{OpcConfig, OpcStats};
use crate::models::skill::SkillInfo;
use crate::models::tool::ToolInfo;
use crate::services::deployment as deployment_service;
use crate::services::deployment::DeploymentTask;
use crate::services::log_service::LogEntry;
use crate::services::snapshot_service::{RestoreSnapshotResponse, SnapshotInfo};
use crate::services::{
    agent_service, binding_service, channel_service, model_service, opc_service, skill_service,
    snapshot_service, log_service, tool_service, office as office_service, ssh_service,
    daemon_install_service,
};

// ── AppState ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub tunnel_pool: Arc<TunnelPool>,
}

// ── AppError → HTTP Response ─────────────────────────────────────────────────

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let status = match &self {
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let body = serde_json::json!({ "error": self.to_string() });
        (status, axum::Json(body)).into_response()
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn routes(state: AppState) -> Router {
    Router::new()
        // Health
        .route("/health", get(health))
        // OPC
        .route("/api/get_all_opcs", post(get_all_opcs))
        .route("/api/get_opc", post(get_opc))
        .route("/api/create_opc", post(create_opc))
        .route("/api/update_opc", post(update_opc))
        .route("/api/delete_opc", post(delete_opc))
        .route("/api/set_current_opc", post(set_current_opc))
        .route("/api/get_current_opc", post(get_current_opc))
        .route("/api/get_opc_stats", post(get_opc_stats))
        .route("/api/update_opc_stats", post(update_opc_stats))
        .route("/api/export_opc", post(export_opc))
        .route("/api/import_opc", post(import_opc))
        // Agent
        .route("/api/get_agents", post(get_agents))
        .route("/api/get_agent", post(get_agent))
        .route("/api/create_agent", post(create_agent))
        .route("/api/batch_create_agents", post(batch_create_agents))
        .route("/api/update_agent", post(update_agent))
        .route("/api/delete_agent", post(delete_agent))
        .route("/api/reorder_agents", post(reorder_agents))
        .route("/api/get_agent_document", post(get_agent_document))
        .route("/api/update_agent_document", post(update_agent_document))
        .route("/api/set_default_agent", post(set_default_agent))
        .route("/api/set_leader", post(set_leader))
        .route("/api/get_agent_documents", post(get_agent_documents))
        // Model / Provider
        .route("/api/get_providers", post(get_providers))
        .route("/api/get_provider", post(get_provider_handler))
        .route("/api/create_provider", post(create_provider))
        .route("/api/update_provider", post(update_provider))
        .route("/api/delete_provider", post(delete_provider))
        .route("/api/get_models", post(get_models))
        .route("/api/set_models", post(set_models))
        .route("/api/test_provider", post(test_provider))
        .route("/api/get_known_providers", post(get_known_providers))
        .route("/api/suggest_provider", post(suggest_provider))
        // Channel
        .route("/api/get_channels", post(get_channels))
        .route("/api/get_channel", post(get_channel))
        .route("/api/upsert_channel", post(upsert_channel))
        .route("/api/delete_channel", post(delete_channel))
        .route("/api/test_feishu_connection", post(test_feishu_connection))
        // Binding
        .route("/api/get_bindings", post(get_bindings))
        .route("/api/get_binding", post(get_binding))
        .route("/api/create_binding", post(create_binding))
        .route("/api/update_binding", post(update_binding))
        .route("/api/delete_binding", post(delete_binding))
        .route("/api/toggle_binding", post(toggle_binding))
        .route("/api/get_feishu_channels", post(get_feishu_channels))
        // Tool
        .route("/api/get_tools", post(get_tools))
        .route("/api/create_tool", post(create_tool))
        .route("/api/delete_tool", post(delete_tool))
        // Skill
        .route("/api/get_bundle_skills_metadata", post(get_bundle_skills_metadata))
        .route("/api/get_skills", post(get_skills))
        .route("/api/sync_skills_from_clawhub", post(sync_skills_from_clawhub))
        .route("/api/sync_skills", post(sync_skills))
        .route("/api/create_skill", post(create_skill))
        .route("/api/delete_skill", post(delete_skill))
        .route("/api/install_skill", post(install_skill))
        .route("/api/uninstall_skill", post(uninstall_skill))
        .route("/api/search_skills", post(search_skills))
        // Snapshot
        .route("/api/create_snapshot", post(create_snapshot))
        .route("/api/get_snapshots", post(get_snapshots))
        .route("/api/get_snapshot", post(get_snapshot))
        .route("/api/restore_snapshot", post(restore_snapshot))
        .route("/api/delete_snapshot", post(delete_snapshot))
        // Office
        .route("/api/get_offices", post(get_offices))
        .route("/api/get_office", post(get_office))
        .route("/api/create_office", post(create_office))
        .route("/api/update_office", post(update_office))
        .route("/api/delete_office", post(delete_office))
        .route("/api/assign_office", post(assign_office))
        .route("/api/get_opc_office", post(get_opc_office))
        .route("/api/get_office_deployments", post(get_office_deployments))
        .route("/api/check_daemon_health", post(check_daemon_health))
        .route("/api/check_ssh_connection", post(check_ssh_connection))
        .route("/api/check_ssh_auth", post(check_ssh_auth))
        .route("/api/install_daemon", post(install_daemon))
        .route("/api/install_decoration", post(install_decoration))
        .route("/api/probe_local_daemon", post(probe_local_daemon))
        .route("/api/probe_remote_daemon", post(probe_remote_daemon))
        .route("/api/get_local_daemon_version", post(get_local_daemon_version))
        // Deployment
        .route("/api/start_deployment", post(start_deployment))
        .route("/api/get_deployment_status", post(get_deployment_status))
        .route("/api/cancel_deployment", post(cancel_deployment))
        .route("/api/get_recent_deployments", post(get_recent_deployments))
        .route("/api/undeploy", post(undeploy))
        .route("/api/build_deploy_package", post(build_deploy_package))
        .route("/api/deploy_to_office", post(deploy_to_office))
        .route("/api/generate_openclaw_config", post(generate_openclaw_config))
        // Log
        .route("/api/get_logs", post(get_logs))
        .route("/api/write_log", post(write_log))
        // Process
        .route("/api/get_process_status", post(get_process_status))
        .route("/api/start_openclaw", post(start_openclaw))
        .route("/api/stop_openclaw", post(stop_openclaw))
        .route("/api/reload_openclaw", post(reload_openclaw))
        .route("/api/restart_openclaw", post(restart_openclaw))
        // Settings / License
        .route("/api/activate_license", post(activate_license))
        .route("/api/deactivate_license", post(deactivate_license))
        .route("/api/get_license_status", post(get_license_status))
        .route("/api/get_opc_root", post(get_opc_root))
        .route("/api/set_opc_root", post(set_opc_root))
        // AI
        .route("/api/ai_generate_agent", post(ai_generate_agent))
        .route("/api/ai_generate_agents", post(ai_generate_agents))
        .route("/api/chat_with_agent", post(chat_with_agent))
        // Middleware
        .layer(RequestBodyLimitLayer::new(50 * 1024 * 1024)) // 50MB
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ── Health ────────────────────────────────────────────────────────────────────

async fn health() -> Json<Value> {
    Json(serde_json::json!({ "ok": true }))
}

// ── OPC handlers ─────────────────────────────────────────────────────────────

async fn get_all_opcs(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<OpcConfig>>, AppError> {
    let result = opc_service::get_all_opcs(&state.pool)?;
    Ok(Json(result))
}

async fn get_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<OpcConfig>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(opc_service::get_opc(&state.pool, &id)?))
}

async fn create_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let config: OpcConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    Ok(Json(opc_service::create_opc(&state.pool, config)?))
}

async fn update_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let config: OpcConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    opc_service::update_opc(&state.pool, &id, config)?;
    Ok(Json(()))
}

async fn delete_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    opc_service::delete_opc(&state.pool, &id)?;
    Ok(Json(()))
}

async fn set_current_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    opc_service::set_current_opc(&state.pool, &id)?;
    Ok(Json(()))
}

async fn get_current_opc(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<OpcConfig>, AppError> {
    Ok(Json(opc_service::get_current_opc(&state.pool)?))
}

async fn get_opc_stats(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<OpcStats>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(opc_service::get_opc_stats(&state.pool, &opc_id)?))
}

async fn update_opc_stats(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    opc_service::update_opc_stats(&state.pool, &id)?;
    Ok(Json(()))
}

async fn export_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(opc_service::export_opc(&state.pool, &opc_id)?))
}

async fn import_opc(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let json = body["json"].as_str().unwrap_or_default().to_string();
    Ok(Json(opc_service::import_opc(&state.pool, &json)?))
}

// ── Agent handlers ────────────────────────────────────────────────────────────

async fn get_agents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<AgentConfig>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(agent_service::get_agents(&state.pool, &opc_id)?))
}

async fn get_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<AgentConfig>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(agent_service::get_agent(&state.pool, &id)?))
}

async fn create_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let config: AgentConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    let documents: Option<HashMap<String, String>> =
        if body["documents"].is_null() || !body["documents"].is_object() {
            None
        } else {
            serde_json::from_value(body["documents"].clone()).ok()
        };

    let id = agent_service::create_agent(&state.pool, config)?;
    if let Some(docs) = documents {
        for (doc_type, content) in docs {
            if !content.trim().is_empty() {
                agent_service::upsert_agent_document(&state.pool, &id, &doc_type, &content)?;
            }
        }
    }
    Ok(Json(id))
}

async fn batch_create_agents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<String>>, AppError> {
    let agents: Vec<AgentConfig> = serde_json::from_value(body["agents"].clone())
        .map_err(|e| AppError::Validation(format!("invalid agents: {}", e)))?;
    let documents: HashMap<String, HashMap<String, String>> =
        if body["documents"].is_null() || !body["documents"].is_object() {
            HashMap::new()
        } else {
            serde_json::from_value(body["documents"].clone()).unwrap_or_default()
        };
    Ok(Json(agent_service::batch_create_agents(
        &state.pool,
        agents,
        documents,
    )?))
}

async fn update_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let config: AgentConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    agent_service::update_agent(&state.pool, &id, config)?;
    Ok(Json(()))
}

async fn delete_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    agent_service::delete_agent(&state.pool, &id)?;
    Ok(Json(()))
}

async fn reorder_agents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let agent_ids: Vec<String> = serde_json::from_value(body["agent_ids"].clone())
        .map_err(|e| AppError::Validation(format!("invalid agent_ids: {}", e)))?;
    agent_service::reorder_agents(&state.pool, &opc_id, agent_ids)?;
    Ok(Json(()))
}

async fn get_agent_document(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let agent_id = body["agent_id"].as_str().unwrap_or_default().to_string();
    let doc_type = body["doc_type"].as_str().unwrap_or_default().to_string();
    Ok(Json(agent_service::get_agent_document(
        &state.pool,
        &agent_id,
        &doc_type,
    )?))
}

async fn update_agent_document(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let agent_id = body["agent_id"].as_str().unwrap_or_default().to_string();
    let doc_type = body["doc_type"].as_str().unwrap_or_default().to_string();
    let content = body["content"].as_str().unwrap_or_default().to_string();
    agent_service::upsert_agent_document(&state.pool, &agent_id, &doc_type, &content)?;
    Ok(Json(()))
}

async fn set_default_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let agent_id = body["agent_id"].as_str().unwrap_or_default().to_string();
    agent_service::set_default_agent(&state.pool, &opc_id, &agent_id)?;
    Ok(Json(()))
}

async fn set_leader(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let agent_id = body["agent_id"].as_str().unwrap_or_default().to_string();
    agent_service::set_default_agent(&state.pool, &opc_id, &agent_id)?;
    Ok(Json(()))
}

async fn get_agent_documents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<AgentDocument>>, AppError> {
    let agent_id = body["agent_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(agent_service::get_agent_documents(
        &state.pool,
        &agent_id,
    )?))
}

// ── Model / Provider handlers ─────────────────────────────────────────────────

async fn get_providers(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<ProviderConfig>>, AppError> {
    Ok(Json(model_service::get_providers(&state.pool)?))
}

async fn get_provider_handler(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ProviderConfig>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(model_service::get_provider(&state.pool, &id)?))
}

async fn create_provider(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ProviderConfig>, AppError> {
    let config: ProviderConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    let new_config = ProviderConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: config.name,
        api: config.api,
        base_url: config.base_url,
        api_key: config.api_key,
        is_enabled: true,
        is_available: config.is_available,
        last_tested: config.last_tested,
        created_at: chrono::Utc::now().timestamp(),
        updated_at: chrono::Utc::now().timestamp(),
    };
    Ok(Json(model_service::create_provider(
        &state.pool,
        new_config,
    )?))
}

async fn update_provider(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ProviderConfig>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let name: Option<String> = body["name"].as_str().map(|s| s.to_string());
    let api: Option<String> = body["api"].as_str().map(|s| s.to_string());
    let base_url: Option<String> = body["base_url"].as_str().map(|s| s.to_string());
    let api_key: Option<String> = body["api_key"].as_str().map(|s| s.to_string());
    let is_enabled: Option<bool> = body["is_enabled"].as_bool();
    Ok(Json(model_service::update_provider_partial(
        &state.pool,
        &id,
        name,
        api,
        base_url,
        api_key,
        is_enabled,
    )?))
}

async fn delete_provider(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    model_service::delete_provider(&state.pool, &id)?;
    Ok(Json(()))
}

async fn get_models(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<ModelInfo>>, AppError> {
    let provider_name: Option<String> = body["provider_name"].as_str().map(|s| s.to_string());
    Ok(Json(model_service::get_models(
        &state.pool,
        provider_name.as_deref(),
    )?))
}

async fn set_models(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let provider_name = body["provider_name"].as_str().unwrap_or_default().to_string();
    let models: Vec<ModelInfo> = serde_json::from_value(body["models"].clone())
        .map_err(|e| AppError::Validation(format!("invalid models: {}", e)))?;
    model_service::set_models(&state.pool, &provider_name, models)?;
    Ok(Json(()))
}

async fn test_provider(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<TestProviderResult>, AppError> {
    use std::time::Instant;
    let base_url = body["base_url"].as_str().unwrap_or_default().to_string();
    let api_key = body["api_key"].as_str().unwrap_or_default().to_string();
    let api = body["api"].as_str().unwrap_or_default().to_string();
    let provider_id: Option<String> = body["provider_id"].as_str().map(|s| s.to_string());

    let start = Instant::now();
    let result = do_test_provider(&base_url, &api_key, &api).await;
    let latency_ms = start.elapsed().as_millis() as u64;
    let ok = result.is_ok();
    let error = result.err();

    if let Some(ref pid) = provider_id {
        let _ = model_service::save_test_result(&state.pool, pid, ok);
    }

    Ok(Json(TestProviderResult {
        ok,
        latency_ms,
        error,
    }))
}

/// Internal provider connectivity test (mirrors commands/model.rs).
async fn do_test_provider(
    base_url: &str,
    api_key: &str,
    api: &str,
) -> std::result::Result<(), String> {
    use std::time::Duration;
    let base = base_url.trim_end_matches('/');
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    match api {
        "anthropic-messages" => {
            let r = client
                .post(format!("{}/messages", base))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": "_ping_",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}]
                }))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = r.status().as_u16();
            if status == 401 || status == 403 {
                return Err(format!("HTTP {}: API Key 无效", status));
            }
            Ok(())
        }
        "gemini" => {
            let r = client
                .get(format!("{}/models", base))
                .query(&[("key", api_key)])
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if r.status().is_success() {
                Ok(())
            } else {
                Err(format!("HTTP {}", r.status()))
            }
        }
        _ => {
            let r = client
                .post(format!("{}/chat/completions", base))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": "_ping_",
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1
                }))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = r.status().as_u16();
            if status == 401 || status == 403 {
                return Err(format!("HTTP {}: API Key 无效", status));
            }
            Ok(())
        }
    }
}

async fn get_known_providers(
    Json(_body): Json<Value>,
) -> Result<Json<Vec<KnownProviderInfo>>, AppError> {
    use crate::commands::model::get_known_providers as cmd_get_known_providers;
    Ok(Json(cmd_get_known_providers().await?))
}

async fn suggest_provider(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Option<SuggestedProvider>>, AppError> {
    let base_url = body["base_url"].as_str().unwrap_or_default().to_string();
    // suggest_provider is a sync fn that uses pool directly
    let lower = base_url.to_lowercase();
    let known = crate::commands::model::known_providers_list();
    let matched = known.iter().find(|p| {
        p.match_urls.iter().any(|u| lower.contains(u.as_str()))
    });

    let Some(matched) = matched else {
        return Ok(Json(None));
    };

    let conn = state.pool.get()?;
    let mut name = matched.suggest_name.clone();
    let mut suffix = 2u32;
    loop {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM model_providers_v2 WHERE name = ?1",
            rusqlite::params![name],
            |r| r.get(0),
        )?;
        if count == 0 {
            break;
        }
        name = format!("{}-{}", matched.suggest_name, suffix);
        suffix += 1;
    }

    Ok(Json(Some(SuggestedProvider {
        name,
        api: matched.api.clone(),
        models: matched.models.clone(),
    })))
}

// ── Channel handlers ──────────────────────────────────────────────────────────

async fn get_channels(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<ChannelConfig>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(channel_service::get_channels(&state.pool, &opc_id)?))
}

async fn get_channel(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ChannelConfig>, AppError> {
    // Frontend passes id as a number (not a string)
    let id_i64: i64 = if let Some(n) = body["id"].as_i64() {
        n
    } else if let Some(s) = body["id"].as_str() {
        s.parse().map_err(|_| AppError::Validation(format!("invalid channel id: {}", s)))?
    } else {
        return Err(AppError::Validation("id is required".to_string()));
    };
    Ok(Json(channel_service::get_channel(&state.pool, id_i64)?))
}

async fn upsert_channel(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let config: ChannelConfig = serde_json::from_value(body["config"].clone())
        .map_err(|e| AppError::Validation(format!("invalid config: {}", e)))?;
    let id = channel_service::upsert_channel(&state.pool, config)?;
    Ok(Json(id.to_string()))
}

async fn delete_channel(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id_i64: i64 = if let Some(n) = body["id"].as_i64() {
        n
    } else if let Some(s) = body["id"].as_str() {
        s.parse().map_err(|_| AppError::Validation(format!("invalid channel id: {}", s)))?
    } else {
        return Err(AppError::Validation("id is required".to_string()));
    };
    channel_service::delete_channel(&state.pool, id_i64)?;
    Ok(Json(()))
}

async fn test_feishu_connection(
    Json(body): Json<Value>,
) -> Result<Json<bool>, AppError> {
    let app_id = body["app_id"].as_str().unwrap_or_default().to_string();
    let app_secret = body["app_secret"].as_str().unwrap_or_default().to_string();
    Ok(Json(channel_service::test_feishu_connection(&app_id, &app_secret)?))
}

// ── Binding handlers ──────────────────────────────────────────────────────────

async fn get_bindings(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<BindingRule>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(binding_service::get_bindings(&state.pool, &opc_id)?))
}

async fn get_binding(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<BindingRule>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(binding_service::get_binding(&state.pool, &id)?))
}

async fn create_binding(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let binding: BindingRule = serde_json::from_value(body["binding"].clone())
        .map_err(|e| AppError::Validation(format!("invalid binding: {}", e)))?;
    Ok(Json(binding_service::create_binding(&state.pool, binding)?))
}

async fn update_binding(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let binding: BindingRule = serde_json::from_value(body["binding"].clone())
        .map_err(|e| AppError::Validation(format!("invalid binding: {}", e)))?;
    binding_service::update_binding(&state.pool, &id, binding)?;
    Ok(Json(()))
}

async fn delete_binding(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    binding_service::delete_binding(&state.pool, &id)?;
    Ok(Json(()))
}

async fn toggle_binding(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let is_enabled = body["is_enabled"].as_bool().unwrap_or(false);
    binding_service::toggle_binding(&state.pool, &id, is_enabled)?;
    Ok(Json(()))
}

async fn get_feishu_channels(
    Json(_body): Json<Value>,
) -> Result<Json<Vec<Value>>, AppError> {
    // Stub: returns empty list until Feishu API integration is implemented
    Ok(Json(vec![]))
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async fn get_tools(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<ToolInfo>>, AppError> {
    Ok(Json(tool_service::get_tools(&state.pool)?))
}

async fn create_tool(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<i64>, AppError> {
    let tool: tool_service::LocalToolInput = serde_json::from_value(body["tool"].clone())
        .map_err(|e| AppError::Validation(format!("invalid tool: {}", e)))?;
    Ok(Json(tool_service::create_tool(&state.pool, tool)?))
}

async fn delete_tool(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_i64().ok_or_else(|| AppError::Validation("id is required".to_string()))?;
    tool_service::delete_tool(&state.pool, id)?;
    Ok(Json(()))
}

// ── Skill handlers ────────────────────────────────────────────────────────────

async fn get_bundle_skills_metadata(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Json<Value> {
    Json(skill_service::get_bundle_skills_metadata(&state.pool)
        .unwrap_or_else(|_| serde_json::json!({ "skills": [] })))
}

async fn get_skills(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<SkillInfo>>, AppError> {
    Ok(Json(skill_service::get_skills(&state.pool)?))
}

async fn sync_skills_from_clawhub(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<SkillInfo>>, AppError> {
    Ok(Json(skill_service::sync_skills_from_clawhub(&state.pool)?))
}

async fn sync_skills(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<SkillInfo>>, AppError> {
    Ok(Json(skill_service::sync_skills_from_clawhub(&state.pool)?))
}

async fn create_skill(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<i64>, AppError> {
    let skill: skill_service::LocalSkillInput = serde_json::from_value(body["skill"].clone())
        .map_err(|e| AppError::Validation(format!("invalid skill: {}", e)))?;
    Ok(Json(skill_service::create_skill(&state.pool, skill)?))
}

async fn delete_skill(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_i64().ok_or_else(|| AppError::Validation("id is required".to_string()))?;
    skill_service::delete_skill(&state.pool, id)?;
    Ok(Json(()))
}

async fn install_skill(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let slug = body["slug"].as_str().unwrap_or_default().to_string();
    match skill_service::install_skill(&state.pool, slug).await {
        Ok(result) => Ok(Json(serde_json::json!({ "ok": result.ok, "error": result.error }))),
        Err(e) => Ok(Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

async fn uninstall_skill(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let slug = body["slug"].as_str().unwrap_or_default().to_string();
    match skill_service::uninstall_skill(&state.pool, slug).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Ok(Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

async fn search_skills(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let q = body["q"].as_str().unwrap_or_default().to_string();
    let source: Option<String> = body["source"].as_str().map(|s| s.to_string());
    let limit: Option<i64> = body["limit"].as_i64();
    match skill_service::search_skills(q, source, limit).await {
        Ok(skills) => Ok(Json(serde_json::json!({ "ok": true, "skills": skills }))),
        Err(e) => Ok(Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── Snapshot handlers ─────────────────────────────────────────────────────────

async fn create_snapshot(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let label = body["label"].as_str().unwrap_or_default().to_string();
    let is_auto = body["is_auto"].as_bool().unwrap_or(false);
    Ok(Json(snapshot_service::create_snapshot(
        &state.pool,
        &opc_id,
        &label,
        is_auto,
    )?))
}

async fn get_snapshots(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<SnapshotInfo>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(snapshot_service::get_snapshots(&state.pool, &opc_id)?))
}

async fn get_snapshot(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<SnapshotInfo>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(snapshot_service::get_snapshot(&state.pool, &id)?))
}

async fn restore_snapshot(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<RestoreSnapshotResponse>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(snapshot_service::restore_snapshot(&state.pool, &id)?))
}

async fn delete_snapshot(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    snapshot_service::delete_snapshot(&state.pool, &id)?;
    Ok(Json(()))
}

// ── Office handlers ───────────────────────────────────────────────────────────

async fn get_offices(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<Vec<Office>>, AppError> {
    Ok(Json(office_service::get_offices(&state.pool)?))
}

async fn get_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Office>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    Ok(Json(office_service::get_office(&state.pool, &id)?))
}

async fn create_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let office: Office = serde_json::from_value(body["office"].clone())
        .map_err(|e| AppError::Validation(format!("invalid office: {}", e)))?;
    Ok(Json(office_service::create_office(&state.pool, &office)?))
}

async fn update_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    let office: Office = serde_json::from_value(body["office"].clone())
        .map_err(|e| AppError::Validation(format!("invalid office: {}", e)))?;
    office_service::update_office(&state.pool, &id, &office)?;
    Ok(Json(()))
}

async fn delete_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let id = body["id"].as_str().unwrap_or_default().to_string();
    office_service::delete_office(&state.pool, &id)?;
    Ok(Json(()))
}

async fn assign_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let office_id: Option<String> = body["office_id"].as_str().map(|s| s.to_string());
    office_service::assign_office(&state.pool, &opc_id, office_id.as_deref())?;
    Ok(Json(()))
}

async fn get_opc_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Option<Office>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(office_service::get_opc_office(&state.pool, &opc_id)?))
}

async fn get_office_deployments(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<OfficeDeployment>>, AppError> {
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    let limit = body["limit"].as_i64().unwrap_or(20);
    Ok(Json(office_service::get_office_deployments(
        &state.pool,
        &office_id,
        limit,
    )?))
}

/// Build the `-i "key_path"` SSH option string.
fn build_ssh_key_arg(key_path: Option<&str>) -> String {
    match key_path {
        Some(p) => format!("-i \"{}\" ", p),
        None => String::new(),
    }
}

async fn check_daemon_health(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<DaemonHealthResult>, AppError> {
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    let office = office_service::get_office(&state.pool, &office_id)?;

    let daemon_url = match office.daemon_url.as_deref() {
        Some(url) if !url.is_empty() => url.to_string(),
        _ => {
            return Ok(Json(DaemonHealthResult {
                ok: false,
                error: Some("未配置 Daemon URL".into()),
                ..Default::default()
            }))
        }
    };

    let bin_paths: Option<(String, String)> = match (
        &office.openclaw_nodejs_path,
        &office.openclaw_install_path,
    ) {
        (Some(n), Some(o)) if !n.is_empty() && !o.is_empty() => Some((n.clone(), o.clone())),
        _ => None,
    };
    let bin_refs = bin_paths.as_ref().map(|(n, o)| (n.as_str(), o.as_str()));

    let address = office.address.as_deref().unwrap_or("");
    let is_remote = !address.is_empty() && address != "localhost";

    if is_remote {
        let (host, ssh_port) = if let Some(idx) = address.rfind(':') {
            let port = address[idx + 1..].parse::<u16>().unwrap_or(22);
            (&address[..idx], port)
        } else {
            (address, 22u16)
        };
        let key_arg = build_ssh_key_arg(office.ssh_key_path.as_deref());
        let ssh_user = office.access_user.as_deref().unwrap_or("root");
        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, ssh_port
        );
        let target = format!("{}@{}", ssh_user, host);
        let local_port = state.tunnel_pool.get_or_create(&office_id, || {
            SshTunnel::open(&prefix, &target, 16668)
                .map_err(|e| AppError::Internal(format!("SSH 隧道建立失败: {}", e)))
        })?;
        let access_url = format!("http://127.0.0.1:{}", local_port);
        return Ok(Json(
            office_service::check_daemon_health(&access_url, bin_refs).await,
        ));
    }

    Ok(Json(
        office_service::check_daemon_health(&daemon_url, bin_refs).await,
    ))
}

async fn check_ssh_connection(
    Json(body): Json<Value>,
) -> Result<Json<SshConnectionResult>, AppError> {
    let host = body["host"].as_str().unwrap_or_default().to_string();
    let port = body["port"].as_u64().map(|p| p as u16).unwrap_or(22);
    let user = body["user"].as_str().map(|s| s.to_string());
    let key_path = body["key_path"].as_str().map(|s| s.to_string());
    let username = user.as_deref().unwrap_or("root");
    let result = ssh_service::test_ssh_connection(&host, port, username, key_path.as_deref(), 5);
    Ok(Json(SshConnectionResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
    }))
}

async fn check_ssh_auth(
    Json(body): Json<Value>,
) -> Result<Json<SshAuthResult>, AppError> {
    let address = body["address"].as_str().unwrap_or_default().to_string();
    let auth_type = body["auth_type"].as_str().unwrap_or("ssh_key").to_string();
    let user = body["user"].as_str().map(|s| s.to_string());
    let password = body["password"].as_str().map(|s| s.to_string());
    let key_path = body["key_path"].as_str().map(|s| s.to_string());

    let (host, port) = if let Some(idx) = address.find(':') {
        let port_str = &address[idx + 1..];
        let port = port_str.parse().unwrap_or(22);
        (address[..idx].to_string(), port)
    } else {
        (address.clone(), 22u16)
    };

    let username = user.as_deref().unwrap_or("root");
    let ssh_key = key_path.clone();

    let result = if auth_type == "ssh_key" {
        let kp = match key_path {
            Some(p) => p,
            None => {
                return Ok(Json(SshAuthResult {
                    ok: false,
                    latency_ms: None,
                    error: Some("SSH 密钥路径未提供".into()),
                    sudo_ok: None,
                    platform: None,
                    arch: None,
                }))
            }
        };
        ssh_service::test_ssh_key(&host, port, username, &kp, 8)
    } else {
        let pw = match password {
            Some(p) => p,
            None => {
                return Ok(Json(SshAuthResult {
                    ok: false,
                    latency_ms: None,
                    error: Some("SSH 密码未提供".into()),
                    sudo_ok: None,
                    platform: None,
                    arch: None,
                }))
            }
        };
        ssh_service::test_ssh_password(&host, port, username, &pw, 8)
    };

    if !result.ok {
        return Ok(Json(SshAuthResult {
            ok: false,
            latency_ms: Some(result.latency_ms),
            error: result.error,
            sudo_ok: None,
            platform: None,
            arch: None,
        }));
    }

    let key_path_ref = ssh_key.as_deref();
    let (platform, arch) = match (
        ssh_service::run_ssh_command(&host, port, username, key_path_ref, "uname -s", 5),
        ssh_service::run_ssh_command(&host, port, username, key_path_ref, "uname -m", 5),
    ) {
        (Ok(os), Ok(raw_arch)) => {
            let platform = if os == "Darwin" { "darwin" } else { "linux" };
            let arch = if raw_arch == "aarch64" || raw_arch == "arm64" {
                "arm64"
            } else {
                "x64"
            };
            (Some(platform.to_string()), Some(arch.to_string()))
        }
        _ => (None, None),
    };

    Ok(Json(SshAuthResult {
        ok: result.ok,
        latency_ms: Some(result.latency_ms),
        error: result.error,
        sudo_ok: None,
        platform,
        arch,
    }))
}

async fn install_daemon(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<InstallDaemonResult>, AppError> {
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    let mode = body["mode"].as_str().map(|s| s.to_string());
    let daemon_port = body["daemon_port"].as_u64().map(|p| p as u16);
    let ssh_host = body["ssh_host"].as_str().map(|s| s.to_string());
    let ssh_port = body["ssh_port"].as_u64().map(|p| p as u16);
    let ssh_user = body["ssh_user"].as_str().map(|s| s.to_string());
    let ssh_key_path = body["ssh_key_path"].as_str().map(|s| s.to_string());

    let port = daemon_port.unwrap_or(16668);
    let is_remote = mode.as_deref() == Some("ssh");

    let (ssh_prefix, ssh_target) = if is_remote {
        let host = ssh_host.unwrap_or_default();
        let port_val = ssh_port.unwrap_or(22);
        let user = ssh_user.as_deref().unwrap_or("root");
        let key_arg = build_ssh_key_arg(ssh_key_path.as_deref());
        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, port_val
        );
        let target = format!("{}@{}", user, host);
        (Some(prefix), Some(target))
    } else {
        (None, None)
    };

    match daemon_install_service::install_daemon(port, ssh_prefix.as_deref(), ssh_target.as_deref()) {
        Ok(result) => {
            if let Some(url) = &result.daemon_url {
                let _ = office_service::update_office_daemon_config_by_id(
                    &state.pool,
                    &office_id,
                    url,
                );
            }
            Ok(Json(InstallDaemonResult {
                ok: true,
                logs: result.logs,
                error: None,
                daemon_url: result.daemon_url,
                already_running: None,
            }))
        }
        Err(e) => Ok(Json(InstallDaemonResult {
            ok: false,
            logs: vec![],
            error: Some(e.to_string()),
            daemon_url: None,
            already_running: None,
        })),
    }
}

/// Strip ANSI color codes.
fn strip_ansi_codes(s: &str) -> String {
    let re = regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").unwrap();
    re.replace_all(s, "").into_owned()
}

/// Build offline package download URL.
fn build_offline_package_url(version: &str, platform: &str, arch: &str) -> String {
    let ext = if platform == "windows" { "zip" } else { "tar.gz" };
    format!(
        "https://github.com/hashibit/openclaw-pkgs/releases/download/v{}/openclaw-pkgs-v{}-{}-{}.{}",
        version, version, platform, arch, ext
    )
}

async fn install_decoration(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<InstallDaemonResult>, AppError> {
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    let mode = body["mode"].as_str().map(|s| s.to_string());
    let ssh_host = body["ssh_host"].as_str().map(|s| s.to_string());
    let ssh_port = body["ssh_port"].as_u64().map(|p| p as u16);
    let ssh_user = body["ssh_user"].as_str().map(|s| s.to_string());
    let ssh_key_path = body["ssh_key_path"].as_str().map(|s| s.to_string());

    let mut logs: Vec<String> = Vec::new();
    let mut lg = |line: &str| {
        logs.push(strip_ansi_codes(line));
    };

    // Get latest version from GitHub releases
    lg("获取最新版本号...");
    let client = reqwest::Client::new();
    let release_resp = match client
        .get("https://api.github.com/repos/hashibit/openclaw-pkgs/releases/latest")
        .header("User-Agent", "ClawPilot")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some(format!("GitHub API 请求失败: {}", e)),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    let release: Value = match release_resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some(format!("解析 GitHub API 响应失败: {}", e)),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    let version = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .map(|v| v.trim_start_matches('v').to_string())
        .unwrap_or_default();

    if version.is_empty() {
        return Ok(Json(InstallDaemonResult {
            ok: false,
            logs,
            error: Some("无法获取最新版本号".to_string()),
            daemon_url: None,
            already_running: None,
        }));
    }
    lg(&format!("   最新版本: {}", version));

    let mut office = match office_service::get_office(&state.pool, &office_id) {
        Ok(o) => o,
        Err(e) => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some(format!("获取 office 信息失败: {}", e)),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    let is_remote = mode.as_deref() == Some("ssh");
    let (ssh_prefix, ssh_target) = if is_remote {
        let host = ssh_host.unwrap_or_default();
        let port_val = ssh_port.unwrap_or(22);
        let user = ssh_user.as_deref().unwrap_or("root");
        let key_arg = build_ssh_key_arg(ssh_key_path.as_deref());
        let prefix = format!(
            "ssh {}-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {}",
            key_arg, port_val
        );
        (Some(prefix), Some(format!("{}@{}", user, host)))
    } else {
        (None, None)
    };

    lg("探测目标平台信息...");
    let (platform, arch) = {
        let os_type = if is_remote {
            daemon_install_service::OsType::detect_remote(
                ssh_prefix.as_deref().unwrap(),
                ssh_target.as_deref().unwrap(),
            )
            .unwrap_or(daemon_install_service::OsType::Linux)
        } else {
            match daemon_install_service::OsType::detect() {
                Ok(o) => o,
                Err(e) => {
                    return Ok(Json(InstallDaemonResult {
                        ok: false,
                        logs,
                        error: Some(format!("探测本地 OS 失败: {}", e)),
                        daemon_url: None,
                        already_running: None,
                    }))
                }
            }
        };
        let arch_type = if is_remote {
            daemon_install_service::Arch::detect_remote(
                ssh_prefix.as_deref().unwrap(),
                ssh_target.as_deref().unwrap(),
            )
            .unwrap_or(daemon_install_service::Arch::X64)
        } else {
            match daemon_install_service::Arch::detect() {
                Ok(a) => a,
                Err(e) => {
                    return Ok(Json(InstallDaemonResult {
                        ok: false,
                        logs,
                        error: Some(format!("探测本地架构失败: {}", e)),
                        daemon_url: None,
                        already_running: None,
                    }))
                }
            }
        };
        let platform_str = match os_type {
            daemon_install_service::OsType::MacOS => "darwin",
            daemon_install_service::OsType::Linux => "linux",
        };
        (
            platform_str.to_string(),
            arch_type.resource_suffix().to_string(),
        )
    };
    lg(&format!("   平台: {}, 架构: {}", platform, arch));

    let daemon_url = if let Some(url) = office.daemon_url.clone() {
        url
    } else {
        lg("Daemon 未配置，先安装 daemon...");
        let port = 16668u16;
        let install_result = match daemon_install_service::install_daemon(
            port,
            ssh_prefix.as_deref(),
            ssh_target.as_deref(),
        ) {
            Ok(r) => r,
            Err(e) => {
                return Ok(Json(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some(format!("daemon 安装失败: {}", e)),
                    daemon_url: None,
                    already_running: None,
                }))
            }
        };

        if !install_result.ok {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some("daemon 安装失败".to_string()),
                daemon_url: None,
                already_running: None,
            }));
        }

        let url = match install_result.daemon_url {
            Some(u) => u,
            None => {
                return Ok(Json(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some("daemon 安装成功但未返回 URL".to_string()),
                    daemon_url: None,
                    already_running: None,
                }))
            }
        };

        for log_line in &install_result.logs {
            lg(log_line);
        }

        let _ = office_service::update_office_daemon_config_by_id(&state.pool, &office_id, &url);
        office.daemon_url = Some(url.clone());
        lg("Daemon 安装完成，继续安装 OpenClaw...");
        url
    };

    lg(&format!("连接 daemon: {}", daemon_url));

    let _tunnel: Option<SshTunnel>;
    let access_url = if is_remote {
        let tunnel = match SshTunnel::open(
            ssh_prefix.as_deref().unwrap(),
            ssh_target.as_deref().unwrap(),
            16668,
        ) {
            Ok(t) => t,
            Err(e) => {
                return Ok(Json(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some(format!("SSH 隧道建立失败: {}", e)),
                    daemon_url: None,
                    already_running: None,
                }))
            }
        };
        lg(&format!("SSH 隧道已建立 (127.0.0.1:{})", tunnel.local_port));
        let url = format!("http://127.0.0.1:{}", tunnel.local_port);
        _tunnel = Some(tunnel);
        url
    } else {
        _tunnel = None;
        daemon_url.clone()
    };

    let daemon_client = reqwest::Client::new();
    let download_url = build_offline_package_url(&version, &platform, &arch);
    let sha256_url = format!("{}.sha256", download_url);

    let install_req = serde_json::json!({
        "version": version,
        "platform": platform,
        "arch": arch,
        "download_url": download_url,
        "sha256_url": sha256_url,
    });

    let resp = match daemon_client
        .post(format!(
            "{}/install_openclaw",
            access_url.trim_end_matches('/')
        ))
        .json(&install_req)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some(format!("daemon 请求失败: {}", e)),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Ok(Json(InstallDaemonResult {
            ok: false,
            logs,
            error: Some(format!("daemon 返回错误: {}", body_text)),
            daemon_url: None,
            already_running: None,
        }));
    }

    let task_resp: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some(format!("解析 daemon 响应失败: {}", e)),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    let task_id = match task_resp["task_id"].as_str() {
        Some(id) => id.to_string(),
        None => {
            return Ok(Json(InstallDaemonResult {
                ok: false,
                logs,
                error: Some("daemon 未返回 task_id".to_string()),
                daemon_url: None,
                already_running: None,
            }))
        }
    };

    lg(&format!("安装任务已提交: {}", task_id));

    let mut log_offset: usize = 0;
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        let status_resp = daemon_client
            .get(format!(
                "{}/install_openclaw/{}",
                access_url.trim_end_matches('/'),
                task_id
            ))
            .send()
            .await;

        match status_resp {
            Ok(resp) if resp.status().is_success() => {
                let task_state: Value = match resp.json().await {
                    Ok(v) => v,
                    Err(e) => {
                        return Ok(Json(InstallDaemonResult {
                            ok: false,
                            logs,
                            error: Some(format!("解析任务状态失败: {}", e)),
                            daemon_url: None,
                            already_running: None,
                        }))
                    }
                };

                let state_val = &task_state["state"];
                let status = state_val["status"].as_str().unwrap_or("unknown");
                let progress = state_val["progress"].as_u64().unwrap_or(0);
                let current_step = state_val["current_step"].as_str().unwrap_or("");

                if let Some(logs_arr) = state_val["logs"].as_array() {
                    for log_entry in &logs_arr[log_offset..] {
                        if let Some(log_str) = log_entry.as_str() {
                            lg(log_str);
                        }
                    }
                    log_offset = logs_arr.len();
                }

                lg(&format!("   [{}%] {}", progress, current_step));

                if status == "success" {
                    lg("检测 OpenClaw 安装路径...");
                    let detect_cmds = vec![
                        ("openclaw_bin", "readlink -f ~/.clawpilot/openclaw-current/node_modules/.bin/openclaw 2>/dev/null || echo ~/.clawpilot/openclaw-current/node_modules/.bin/openclaw"),
                        ("node_bin", "readlink -f ~/.clawpilot/openclaw-current/nodejs/bin/node 2>/dev/null || echo ~/.clawpilot/openclaw-current/nodejs/bin/node"),
                    ];
                    let mut detected_openclaw_bin = String::new();
                    let mut detected_node_bin = String::new();
                    for (label, cmd) in detect_cmds {
                        let full_cmd = if is_remote {
                            format!(
                                "{} {} '{}'",
                                ssh_prefix.as_deref().unwrap(),
                                ssh_target.as_deref().unwrap(),
                                cmd
                            )
                        } else {
                            cmd.to_string()
                        };
                        if let Ok(out) = tokio::process::Command::new("sh")
                            .arg("-c")
                            .arg(&full_cmd)
                            .output()
                            .await
                        {
                            let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
                            if !val.is_empty() {
                                match label {
                                    "openclaw_bin" => detected_openclaw_bin = val,
                                    "node_bin" => detected_node_bin = val,
                                    _ => {}
                                }
                            }
                        }
                    }
                    if !detected_openclaw_bin.is_empty() && !detected_node_bin.is_empty() {
                        lg(&format!("   openclaw: {}", detected_openclaw_bin));
                        lg(&format!("   node:     {}", detected_node_bin));
                        let _ = office_service::update_office_openclaw_info(
                            &state.pool,
                            &office_id,
                            &version,
                            &detected_openclaw_bin,
                            &detected_node_bin,
                            Some(&download_url),
                        );
                    }

                    return Ok(Json(InstallDaemonResult {
                        ok: true,
                        logs,
                        error: None,
                        daemon_url: Some(daemon_url.clone()),
                        already_running: None,
                    }));
                } else if status == "failed" {
                    let error_msg = state_val["error"].as_str().unwrap_or("未知错误").to_string();
                    return Ok(Json(InstallDaemonResult {
                        ok: false,
                        logs,
                        error: Some(error_msg),
                        daemon_url: None,
                        already_running: None,
                    }));
                }
            }
            Ok(resp) => {
                let body_text = resp.text().await.unwrap_or_default();
                return Ok(Json(InstallDaemonResult {
                    ok: false,
                    logs,
                    error: Some(format!("daemon 查询失败: {}", body_text)),
                    daemon_url: None,
                    already_running: None,
                }));
            }
            Err(e) => {
                lg(&format!("连接 daemon 超时: {}", e));
            }
        }
    }
}

async fn probe_local_daemon(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<office_service::ProbeDaemonResult>, AppError> {
    let office_id: Option<String> = body["office_id"].as_str().map(|s| s.to_string());
    Ok(Json(
        office_service::probe_local_daemon(&state.pool, office_id.as_deref()).await,
    ))
}

async fn probe_remote_daemon(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<office_service::ProbeDaemonResult>, AppError> {
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(
        office_service::probe_remote_daemon(&state.pool, &office_id).await,
    ))
}

async fn get_local_daemon_version(
    Json(_body): Json<Value>,
) -> Result<Json<Option<String>>, AppError> {
    Ok(Json(office_service::get_local_daemon_version().await?))
}

// ── Deployment handlers ───────────────────────────────────────────────────────

async fn start_deployment(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<String>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(deployment_service::start_deployment(
        &state.pool,
        &opc_id,
        &office_id,
    )?))
}

async fn get_deployment_status(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<DeploymentTask>, AppError> {
    let task_id = body["task_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(deployment_service::get_deployment(
        &state.pool,
        &task_id,
    )?))
}

async fn cancel_deployment(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let task_id = body["task_id"].as_str().unwrap_or_default().to_string();
    deployment_service::cancel_deployment(&state.pool, &task_id)?;
    Ok(Json(()))
}

async fn get_recent_deployments(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<DeploymentTask>>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let limit = body["limit"].as_i64().unwrap_or(20);
    Ok(Json(deployment_service::get_recent_deployments(
        &state.pool,
        &opc_id,
        limit,
    )?))
}

async fn undeploy(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    deployment_service::undeploy(&state.pool, &opc_id).await?;
    Ok(Json(()))
}

async fn build_deploy_package(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(deployment_service::build_deploy_package(
        &state.pool,
        &opc_id,
    )?))
}

async fn deploy_to_office(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    let office_id = body["office_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(
        deployment_service::deploy_to_office(&state.pool, &opc_id, &office_id).await?,
    ))
}

async fn generate_openclaw_config(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let opc_id = body["opc_id"].as_str().unwrap_or_default().to_string();
    Ok(Json(deployment_service::generate_openclaw_config(
        &state.pool,
        &opc_id,
    )?))
}

// ── Log handlers ──────────────────────────────────────────────────────────────

async fn get_logs(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<LogEntry>>, AppError> {
    let level: Option<String> = body["level"].as_str().map(|s| s.to_string());
    let component: Option<String> = body["component"].as_str().map(|s| s.to_string());
    let limit = body["limit"].as_i64().unwrap_or(200);
    Ok(Json(log_service::get_logs(
        &state.pool,
        level.as_deref(),
        component.as_deref(),
        limit,
    )?))
}

async fn write_log(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<i64>, AppError> {
    let level = body["level"].as_str().unwrap_or("info").to_string();
    let component: Option<String> = body["component"].as_str().map(|s| s.to_string());
    let message = body["message"].as_str().unwrap_or_default().to_string();
    let agent_id: Option<String> = body["agent_id"].as_str().map(|s| s.to_string());
    let channel: Option<String> = body["channel"].as_str().map(|s| s.to_string());
    Ok(Json(log_service::write_log(
        &state.pool,
        &level,
        component.as_deref(),
        &message,
        agent_id.as_deref(),
        channel.as_deref(),
    )?))
}

// ── Process handlers ──────────────────────────────────────────────────────────

async fn get_process_status(
    Json(_body): Json<Value>,
) -> Json<ProcessStatusResponse> {
    use crate::openclaw::process::{get_process_info, ProcessState};
    let info = get_process_info();
    let is_running = info.state == ProcessState::Running;
    Json(ProcessStatusResponse {
        is_running,
        pid: info.pid,
        uptime_seconds: info.uptime_secs,
        probed_at: chrono::Utc::now().timestamp_millis(),
        daemon_available: is_running,
        daemon_error: None,
    })
}

async fn start_openclaw(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    use crate::openclaw::process::start_openclaw as start_process;
    let opc_name = body["opc_name"].as_str().unwrap_or_default().to_string();
    let pid = start_process(&opc_name)?;
    Ok(Json(serde_json::json!({ "ok": true, "message": "started", "pid": pid })))
}

async fn stop_openclaw(
    Json(_body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    use crate::openclaw::process::stop_openclaw as stop_process;
    stop_process()?;
    Ok(Json(serde_json::json!({ "ok": true, "message": "stopped" })))
}

async fn reload_openclaw(
    Json(_body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    use crate::openclaw::process::reload_config;
    reload_config()?;
    Ok(Json(serde_json::json!({ "ok": true, "message": "reloaded" })))
}

async fn restart_openclaw(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    use crate::openclaw::process::{start_openclaw as start_process, stop_openclaw as stop_process};
    let opc_name = body["opc_name"].as_str().unwrap_or_default().to_string();
    stop_process()?;
    std::thread::sleep(std::time::Duration::from_millis(500));
    let pid = start_process(&opc_name)?;
    Ok(Json(serde_json::json!({ "ok": true, "message": "restarted", "pid": pid })))
}

// ── Settings / License handlers ───────────────────────────────────────────────

async fn activate_license(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<bool>, AppError> {
    use crate::commands::settings::FALLBACK_LICENSE_KEYS;

    let license_key = body["license_key"].as_str().unwrap_or_default().to_string();
    let key = license_key.trim().to_uppercase();

    fn is_valid_key(key: &str) -> bool {
        // Load via the same logic as settings command
        if let Ok(env_val) = std::env::var("CLAWPILOT_LICENSE_KEYS") {
            let keys: Vec<String> = env_val
                .split(',')
                .map(|k| k.trim().to_uppercase())
                .filter(|k| !k.is_empty())
                .collect();
            if !keys.is_empty() {
                return keys.iter().any(|k| k == key);
            }
        }
        if let Some(home) = dirs::home_dir() {
            let conf_path = home.join(".clawpilot").join("license.conf");
            if let Ok(contents) = std::fs::read_to_string(&conf_path) {
                let keys: Vec<String> = contents
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .map(|l| l.to_uppercase())
                    .collect();
                if !keys.is_empty() {
                    return keys.iter().any(|k| k == key);
                }
            }
        }
        FALLBACK_LICENSE_KEYS.iter().any(|k| k.to_uppercase() == key)
    }

    if !is_valid_key(&key) {
        return Err(AppError::Validation("无效的许可证密钥".to_string()));
    }

    let conn = state.pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('license_key', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key],
    )?;
    Ok(Json(true))
}

async fn deactivate_license(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<()>, AppError> {
    let conn = state.pool.get()?;
    conn.execute("DELETE FROM settings WHERE key = 'license_key'", [])?;
    Ok(Json(()))
}

async fn get_license_status(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<LicenseStatus>, AppError> {
    use crate::commands::settings::FALLBACK_LICENSE_KEYS;

    fn is_valid_key(key: &str) -> bool {
        if let Ok(env_val) = std::env::var("CLAWPILOT_LICENSE_KEYS") {
            let keys: Vec<String> = env_val
                .split(',')
                .map(|k| k.trim().to_uppercase())
                .filter(|k| !k.is_empty())
                .collect();
            if !keys.is_empty() {
                return keys.iter().any(|k| k == key);
            }
        }
        if let Some(home) = dirs::home_dir() {
            let conf_path = home.join(".clawpilot").join("license.conf");
            if let Ok(contents) = std::fs::read_to_string(&conf_path) {
                let keys: Vec<String> = contents
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .map(|l| l.to_uppercase())
                    .collect();
                if !keys.is_empty() {
                    return keys.iter().any(|k| k == key);
                }
            }
        }
        FALLBACK_LICENSE_KEYS.iter().any(|k| k.to_uppercase() == key)
    }

    fn mask_key(key: &str) -> String {
        let parts: Vec<&str> = key.split('-').collect();
        if parts.len() >= 3 {
            let first = parts[0];
            let last = parts[parts.len() - 1];
            let masked_middle: Vec<&str> = parts[1..parts.len() - 1].iter().map(|_| "****").collect();
            format!("{}-{}-{}", first, masked_middle.join("-"), last)
        } else {
            format!("{}****", &key[..key.len().min(4)])
        }
    }

    let conn = state.pool.get()?;
    let stored_key = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'license_key'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok();

    match stored_key {
        Some(key) if is_valid_key(&key) => Ok(Json(LicenseStatus {
            activated: true,
            license_key: Some(mask_key(&key)),
        })),
        Some(_) => Ok(Json(LicenseStatus {
            activated: false,
            license_key: None,
        })),
        None => Ok(Json(LicenseStatus {
            activated: false,
            license_key: None,
        })),
    }
}

async fn get_opc_root(
    State(state): State<AppState>,
    Json(_body): Json<Value>,
) -> Result<Json<String>, AppError> {
    use crate::database::helpers;
    let value = helpers::get_setting(&state.pool, "opc_root")?;
    Ok(Json(value.unwrap_or_else(|| "~/.openclaw/OPC".to_string())))
}

async fn set_opc_root(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<()>, AppError> {
    use crate::database::helpers;
    let opc_root = body["opc_root"].as_str().unwrap_or_default().to_string();
    helpers::set_setting(&state.pool, "opc_root", &opc_root)?;
    Ok(Json(()))
}

// ── AI handlers ───────────────────────────────────────────────────────────────

async fn ai_generate_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<AiGeneratedAgent>, AppError> {
    let prompt = body["prompt"].as_str().unwrap_or_default().to_string();
    if prompt.trim().is_empty() {
        return Err(AppError::Validation("prompt is required".to_string()));
    }
    // Reuse logic from commands/ai.rs directly via the service functions
    let result = cmd_ai_generate_agent(&state.pool, &prompt).await?;
    Ok(Json(result))
}

async fn ai_generate_agents(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Vec<AiGeneratedAgent>>, AppError> {
    let prompts: Option<Vec<String>> = if body["prompts"].is_array() {
        serde_json::from_value(body["prompts"].clone()).ok()
    } else {
        None
    };
    let prompt: Option<String> = body["prompt"].as_str().map(|s| s.to_string());
    let result = cmd_ai_generate_agents(&state.pool, prompts, prompt).await?;
    Ok(Json(result))
}

async fn chat_with_agent(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<ChatResponse>, AppError> {
    let agent_id: Option<String> = body["agent_id"].as_str().map(|s| s.to_string());
    let messages: Vec<ChatMessage> = serde_json::from_value(body["messages"].clone())
        .map_err(|e| AppError::Validation(format!("invalid messages: {}", e)))?;
    let soul_override: Option<String> = body["soul_override"].as_str().map(|s| s.to_string());

    if messages.is_empty() {
        return Err(AppError::Validation("messages is required".to_string()));
    }

    let result = cmd_chat_with_agent(&state.pool, agent_id, messages, soul_override).await?;
    Ok(Json(result))
}

// ── AI helpers (mirrors commands/ai.rs private functions) ─────────────────────

use std::sync::LazyLock;
static JSON_CODE_BLOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"```(?:json)?\s*([\s\S]*?)```").expect("invalid regex pattern")
});

const VALID_TOOL_IDS: &[&str] = &[
    "web_search", "web_reader", "feishu_message", "code_interpreter",
    "file_reader", "image_gen", "image_analysis", "http_request", "asr", "tts",
];

const VALID_SKILL_SLUGS: &[&str] = &[
    "multi-round-memory", "proactive-speak", "scheduled-heartbeat",
    "mention-response", "direct-response", "message-routing",
    "context-compression", "tool-calling", "memory-persistence",
    "emotional-aware", "github-helper", "web-search", "feishu-helper",
];

const SYSTEM_PROMPT_SINGLE: &str = r#"/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置。严格以 JSON 格式返回。只输出 JSON，不要有任何其他内容。"#;

const SYSTEM_PROMPT_MULTI: &str = r#"/no_think 你是一个 OpenClaw Agent 团队配置生成器。根据用户的描述，生成完整的团队配置。严格以 JSON 数组格式返回，每个元素是一个完整的智能体配置。不要有任何其他内容。"#;

async fn call_llm(
    pool: &DbPool,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
    timeout_secs: u64,
) -> crate::error::Result<String> {
    use crate::database::helpers;
    use std::time::Duration;

    let (api_key_enc, base_url) = helpers::get_bailian_credentials(pool)?;
    if api_key_enc.is_empty() {
        return Err(AppError::Validation("BAILIAN 未配置 API Key".to_string()));
    }
    let api_key = crate::utils::crypto::decrypt(&api_key_enc)?;
    let base_url = base_url.trim_end_matches('/').to_string();
    let is_anthropic = base_url.contains("anthropic");
    let model = "qwen3.5-plus";

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    if is_anthropic {
        let endpoint = format!("{}/v1/messages", base_url);
        let resp = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "system": system_prompt,
                "messages": [{ "role": "user", "content": user_prompt }],
                "max_tokens": max_tokens,
                "thinking": { "type": "disabled" },
            }))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("请求失败：{}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Anthropic API 错误 {}: {}",
                status,
                body.chars().take(200).collect::<String>()
            )));
        }
        let data: Value = resp.json().await
            .map_err(|e| AppError::Internal(format!("解析响应失败：{}", e)))?;
        Ok(data["content"][0]["text"].as_str().unwrap_or("").to_string())
    } else {
        let endpoint = format!("{}/chat/completions", base_url);
        let resp = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_prompt }
                ],
                "max_tokens": max_tokens,
                "response_format": { "type": "json_object" },
                "stream": false,
                "enable_thinking": false,
            }))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("请求失败：{}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenAI API 错误 {}: {}",
                status,
                body.chars().take(200).collect::<String>()
            )));
        }
        let data: Value = resp.json().await
            .map_err(|e| AppError::Internal(format!("解析响应失败：{}", e)))?;
        Ok(data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}

async fn call_llm_chat(
    pool: &DbPool,
    messages: Vec<Value>,
    max_tokens: u32,
) -> crate::error::Result<String> {
    use crate::database::helpers;
    use std::time::Duration;

    let (api_key_enc, base_url) = helpers::get_bailian_credentials(pool)?;
    if api_key_enc.is_empty() {
        return Err(AppError::Validation(
            "BAILIAN 未配置 API Key，请先在模型管理页完成配置".to_string(),
        ));
    }
    let api_key = crate::utils::crypto::decrypt(&api_key_enc)?;
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": "qwen3.5-plus",
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": false,
            "enable_thinking": false,
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("请求失败：{}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "API 错误 {}: {}",
            status,
            body.chars().take(200).collect::<String>()
        )));
    }

    let data: Value = resp.json().await
        .map_err(|e| AppError::Internal(format!("解析响应失败：{}", e)))?;
    Ok(data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}

fn extract_json(raw_text: &str) -> crate::error::Result<Value> {
    serde_json::from_str(raw_text.trim())
        .or_else(|_| {
            if let Some(m) = JSON_CODE_BLOCK_RE.captures(raw_text) {
                serde_json::from_str(&m[1])
            } else {
                serde_json::from_str(raw_text.trim())
            }
        })
        .map_err(|e| {
            AppError::Internal(format!(
                "JSON 解析失败：{}\n原始响应：{}",
                e,
                raw_text.chars().take(300).collect::<String>()
            ))
        })
}

fn parse_string_array(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

fn parse_filtered_array(value: &Value, valid: &std::collections::HashSet<&str>) -> Vec<String> {
    value
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| {
                    v.as_str()
                        .filter(|s| valid.contains(s))
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_agent(parsed: &Value, idx: usize) -> AiGeneratedAgent {
    let valid_tools: std::collections::HashSet<&str> = VALID_TOOL_IDS.iter().copied().collect();
    let valid_skills: std::collections::HashSet<&str> = VALID_SKILL_SLUGS.iter().copied().collect();
    AiGeneratedAgent {
        display_name: parsed["display_name"].as_str().unwrap_or("").to_string(),
        name: parsed["name"]
            .as_str()
            .unwrap_or(&format!("agent_{}", idx + 1))
            .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
            .to_lowercase(),
        job_title: parsed["job_title"].as_str().unwrap_or("").to_string(),
        description: parsed["description"].as_str().unwrap_or("").to_string(),
        personality: parsed["personality"].as_str().unwrap_or("").to_string(),
        guardrail_allow: parse_string_array(&parsed["guardrail_allow"]),
        guardrail_deny: parse_string_array(&parsed["guardrail_deny"]),
        enabled_tools: parse_filtered_array(&parsed["enabled_tools"], &valid_tools),
        enabled_skills: parse_filtered_array(&parsed["enabled_skills"], &valid_skills),
        soul: parsed["soul"].as_str().unwrap_or("").to_string(),
        identity: parsed["identity"].as_str().unwrap_or("").to_string(),
        agents: parsed["agents"].as_str().unwrap_or("").to_string(),
        user: parsed["user"].as_str().unwrap_or("").to_string(),
        memory: parsed["memory"].as_str().unwrap_or("").to_string(),
        heartbeat: parsed["heartbeat"].as_str().unwrap_or("").to_string(),
        tools: parsed["tools"].as_str().unwrap_or("").to_string(),
    }
}

async fn cmd_ai_generate_agent(pool: &DbPool, prompt: &str) -> crate::error::Result<AiGeneratedAgent> {
    let raw_text = call_llm(pool, SYSTEM_PROMPT_SINGLE, prompt, 2048, 120).await?;
    let parsed = extract_json(&raw_text)?;
    Ok(parse_agent(&parsed, 0))
}

async fn cmd_ai_generate_agents(
    pool: &DbPool,
    prompts: Option<Vec<String>>,
    prompt: Option<String>,
) -> crate::error::Result<Vec<AiGeneratedAgent>> {
    let prompt_list: Vec<String> = if let Some(list) = prompts {
        list.into_iter().filter(|p| !p.trim().is_empty()).collect()
    } else if let Some(p) = prompt {
        p.split('\n')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        return Err(AppError::Validation("prompts or prompt is required".to_string()));
    };

    if prompt_list.is_empty() {
        return Err(AppError::Validation("prompt list is empty".to_string()));
    }

    let user_prompt = format!(
        "生成一个包含 {} 个智能体的团队配置。\n\n角色描述：\n{}\n\n请为每个角色生成完整的智能体配置，返回 JSON 数组格式。",
        prompt_list.len(),
        prompt_list
            .iter()
            .enumerate()
            .map(|(i, p)| format!("{}. {}", i + 1, p))
            .collect::<Vec<_>>()
            .join("\n")
    );

    let raw_text = call_llm(pool, SYSTEM_PROMPT_MULTI, &user_prompt, 4096, 180).await?;
    let parsed = extract_json(&raw_text)?;

    let arr = if let Some(a) = parsed.as_array() {
        a.clone()
    } else {
        parsed
            .get("agents")
            .or_else(|| parsed.get("items"))
            .or_else(|| parsed.get("results"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| AppError::Internal("AI 返回格式错误：不是数组".to_string()))?
            .clone()
    };

    Ok(arr.iter().enumerate().map(|(idx, item)| parse_agent(item, idx)).collect())
}

async fn cmd_chat_with_agent(
    pool: &DbPool,
    agent_id: Option<String>,
    messages: Vec<ChatMessage>,
    soul_override: Option<String>,
) -> crate::error::Result<ChatResponse> {
    let system_prompt = if let Some(ref soul) = soul_override {
        format!("/no_think\n\n{}", soul)
    } else if let Some(ref aid) = agent_id {
        let doc: Option<String> = match pool.get()?.query_row(
            "SELECT content FROM agent_documents WHERE agent_id = ?1 AND document_type = 'SOUL'",
            [aid],
            |row| Ok(row.get::<_, String>(0)?),
        ) {
            Ok(content) => Some(content),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(AppError::Database(e)),
        };

        let agent_info: Option<(String, String)> = match pool.get()?.query_row(
            "SELECT display_name, job_title FROM agents WHERE id = ?1",
            [aid],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ) {
            Ok(info) => Some(info),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(AppError::Database(e)),
        };

        let mut system = "/no_think 你是一个 OpenClaw Agent。".to_string();
        if let Some((name, title)) = agent_info {
            system.push_str(&format!(" 你的名字是 {}", name));
            system.push_str(&format!(", 职位是 {}", title));
        }
        system.push('.');
        if let Some(content) = doc {
            if !content.trim().is_empty() {
                system = format!("/no_think\n\n{}", content);
            }
        }
        system
    } else {
        return Err(AppError::Validation(
            "agent_id is required when soul_override is not provided".to_string(),
        ));
    };

    let messages_json: Vec<Value> = std::iter::once(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }))
    .chain(messages.iter().map(|m| {
        serde_json::json!({ "role": m.role, "content": m.content })
    }))
    .collect();

    let reply = call_llm_chat(pool, messages_json, 2048).await?;
    Ok(ChatResponse { reply })
}
