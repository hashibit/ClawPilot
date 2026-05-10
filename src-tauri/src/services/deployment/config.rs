use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

/// Generate OPC config JSON from database (simplified version)
pub fn generate_opc_config(pool: &DbPool, opc_id: &str) -> Result<String> {
    let conn = pool.get()?;

    let name: String = conn
        .query_row(
            "SELECT name FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("OPC not found: {}", opc_id)))?;

    let config = serde_json::json!({
        "name": name,
        "version": "1.0.0",
        "agents": [],
        "tools": [],
        "skills": [],
        "bindings": []
    });

    serde_json::to_string_pretty(&config).map_err(|e| AppError::Serialization(e).into())
}

/// Generate openclaw.json config from OPC data — matches server format with $include references
pub fn generate_openclaw_config(pool: &DbPool, opc_id: &str) -> Result<serde_json::Value> {
    use crate::utils::crypto::decrypt;

    let conn = pool.get()?;

    // Verify OPC exists (id is the canonical identifier for paths)
    let _opc_name: String = conn
        .query_row(
            "SELECT name FROM opc_config WHERE id = ?1",
            rusqlite::params![opc_id],
            |r| r.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("OPC not found: {}", opc_id))
            }
            other => AppError::Database(other),
        })?;

    // Get global opc_root from settings table (matches server)
    let opc_root: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'opc_root'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "~/.openclaw/OPC".to_string());

    // Get agents (model field takes priority over model_provider+model_name)
    let agents: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>)> = conn
        .prepare(
            "SELECT name, display_name, model_provider, model_name, initials, model FROM agents WHERE opc_id = ?1 ORDER BY order_index",
        )?
        .query_map(rusqlite::params![opc_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get channels (FEISHU, etc.)
    let channels: Vec<(String, Option<String>)> = conn
        .prepare("SELECT channel_type, feishu_config FROM channels WHERE opc_id = ?1")?
        .query_map(rusqlite::params![opc_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    // Get enabled model providers from model_providers_v2
    let providers: Vec<(String, Option<String>, Option<String>, String, i64)> = conn
        .prepare(
            "SELECT name, api, base_url, COALESCE(api_key, ''), is_enabled FROM model_providers_v2 WHERE is_enabled = 1",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?
        .filter_map(|r| r.ok())
        .collect();

    // Default model: first enabled provider's actual first model from model_info_v2 (matches server)
    let default_model = providers
        .first()
        .and_then(|(provider_name, _, _, _, _)| {
            conn.query_row(
                "SELECT model_id FROM model_info_v2 WHERE provider_name = ?1 ORDER BY sort_order LIMIT 1",
                rusqlite::params![provider_name],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .map(|model_id| format!("{}/{}", provider_name, model_id))
        })
        .unwrap_or_else(|| "anthropic/claude-opus-4-5".to_string());

    // Build agents list — use opc_id (not display_name) in workspace path (matches server)
    let agents_list: Vec<serde_json::Value> = agents
        .iter()
        .map(|(name, display_name, model_provider, model_name, initials, model)| {
            // model field takes priority (matches server: agent.model ?? defaultModel)
            let model_str = model.clone().unwrap_or_else(|| {
                match (model_provider, model_name) {
                    (Some(provider), Some(m)) => format!("{}/{}", provider, m),
                    (Some(provider), None) => format!("{}/default", provider),
                    (None, Some(m)) => m.clone(),
                    (None, None) => default_model.clone(),
                }
            });
            // Emoji: first char of initials (works for both emoji and ASCII), fallback to 🤖
            let emoji_str = initials
                .as_deref()
                .and_then(|s| s.chars().next())
                .map(|c| c.to_string())
                .unwrap_or_else(|| "🤖".to_string());
            serde_json::json!({
                "id": name,
                "name": name,
                "workspace": format!("{}/{}/workspace-{}", opc_root, opc_id, display_name),
                "model": {
                    "primary": model_str
                },
                "identity": {
                    "name": display_name,
                    "emoji": emoji_str,
                },
            })
        })
        .collect();

    // Build channels/plugins section
    let mut channels_section = serde_json::Map::new();
    for (channel_type, feishu_config_enc) in &channels {
        if channel_type == "FEISHU" {
            if let Some(enc_data) = feishu_config_enc {
                if let Ok(decrypted) = decrypt(enc_data) {
                    if let Ok(feishu_config) = serde_json::from_str::<serde_json::Value>(&decrypted)
                    {
                        if let Some(app_id) = feishu_config.get("app_id").and_then(|v| v.as_str()) {
                            let app_secret = feishu_config
                                .get("app_secret")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            channels_section.insert(
                                "feishu".to_string(),
                                serde_json::json!({
                                    "enabled": true,
                                    "appId": app_id,
                                    "appSecret": app_secret,
                                    "connectionMode": "websocket",
                                    "domain": "feishu",
                                    "groupPolicy": "open",
                                    "tools": { "perm": true },
                                }),
                            );
                        }
                    }
                }
            }
        }
    }

    // Build models section — only include providers with models defined (matches server)
    let mut providers_section = serde_json::Map::new();
    for (name, api, base_url, api_key_enc, _) in &providers {
        let api_key = decrypt(api_key_enc).unwrap_or_default();
        let url = base_url.as_deref().unwrap_or("");
        let api_type = api.as_deref().unwrap_or("openai-completions");

        // Get models for this provider
        let models: Vec<serde_json::Value> = conn
            .prepare(
                "SELECT model_id, COALESCE(input_types, '[\"text\"]'), COALESCE(context_window, 0), COALESCE(max_tokens, 0) FROM model_info_v2 WHERE provider_name = ?1 ORDER BY sort_order, model_id",
            )
            .and_then(|mut stmt| {
                stmt.query_map(rusqlite::params![name], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?))
                })
                .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
            })
            .unwrap_or_default()
            .into_iter()
            .map(|(model_id, input_types_raw, ctx_window, max_tokens)| {
                let input: serde_json::Value = serde_json::from_str(&input_types_raw)
                    .unwrap_or_else(|_| serde_json::json!(["text"]));
                serde_json::json!({
                    "id": model_id,
                    "name": model_id,
                    "reasoning": false,
                    "input": input,
                    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                    "contextWindow": ctx_window,
                    "maxTokens": max_tokens,
                })
            })
            .collect();

        // Skip providers with no models (matches server)
        if models.is_empty() {
            continue;
        }

        providers_section.insert(name.clone(), serde_json::json!({
            "baseUrl": url,
            "apiKey": api_key,
            "api": api_type,
            "models": models,
        }));
    }

    // Build agents section
    let agents_section = serde_json::json!({
        "defaults": {
            "workspace": opc_root,
            "model": { "primary": default_model },
        },
        "list": agents_list,
    });

    let models_section = serde_json::json!({ "providers": providers_section });

    // Build bindings section (matches server format)
    let bindings_section: Vec<serde_json::Value> = {
        conn.prepare(
            "SELECT b.agent_id, a.name as agent_name, b.channel_type, b.channel_id FROM bindings b
             LEFT JOIN agents a ON a.id = b.agent_id
             WHERE b.opc_id = ?1 AND b.is_enabled = 1",
        )
        .and_then(|mut stmt| {
            stmt.query_map(rusqlite::params![opc_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default()
        .into_iter()
        .map(|(_, agent_name, channel_type, channel_id)| {
            serde_json::json!({
                "agentId": agent_name.unwrap_or_default(),
                "match": {
                    "channel": channel_type.to_lowercase(),
                    "peer": {
                        "kind": if channel_type == "GROUP" { "group" } else { "direct" },
                        "id": channel_id.unwrap_or_default(),
                    }
                }
            })
        })
        .collect()
    };

    // Return config with _sections for internal use + $include references (matches server)
    Ok(serde_json::json!({
        "_sections": {
            "agents": agents_section,
            "models": models_section,
            "channels": serde_json::Value::Object(channels_section.clone()),
            "bindings": bindings_section,
        },
        "agents": { "$include": format!("./OPC/{}/agents.json5", opc_id) },
        "models": { "$include": format!("./OPC/{}/models.json5", opc_id) },
        "channels": { "$include": format!("./OPC/{}/channels.json5", opc_id) },
        "bindings": { "$include": format!("./OPC/{}/bindings.json5", opc_id) },
    }))
}
