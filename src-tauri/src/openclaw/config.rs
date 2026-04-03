/// openclaw/config.rs
/// 将数据库中的 OPC 配置生成 OpenClaw 兼容的目录结构和文件
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::services::{
    agent_service, binding_service, channel_service, model_service, opc_service,
};
use crate::utils::path::opc_dir;

/// OpenClaw 配置目录结构
/// ```text
/// ~/.openclaw/
/// ├── config.json          # 全局主配置
/// └── <opc_name>/
///     ├── agents.json      # Agent 列表及配置
///     ├── models.json      # Provider/模型配置
///     ├── channels.json    # 渠道配置
///     ├── bindings.json    # 绑定规则
///     └── agents/
///         └── <agent_slug>/
///             ├── SOUL.md
///             ├── IDENTITY.md
///             ├── AGENTS.md
///             ├── USER.md
///             ├── MEMORY.md
///             ├── HEARTBEAT.md
///             └── TOOLS.md
/// ```

/// 为指定 OPC 生成完整的 OpenClaw 配置文件集
pub fn generate_opc_config(pool: &DbPool, opc_id: &str) -> Result<PathBuf> {
    let opc = opc_service::get_opc(pool, opc_id)?;
    let agents = agent_service::get_agents(pool, opc_id)?;
    let providers = model_service::get_providers(pool)?;
    let channels = channel_service::get_channels(pool, opc_id)?;
    let bindings = binding_service::get_bindings(pool, opc_id)?;

    let base = opc_dir(&opc.name)?;
    std::fs::create_dir_all(&base)?;

    // 1. agents.json
    let agents_json: Vec<Value> = agents
        .iter()
        .map(|a| {
            json!({
                "id": a.id,
                "name": a.name,
                "display_name": a.display_name,
                "job_title": a.job_title,
                "model_provider": a.model_provider,
                "model_name": a.model_name,
                "is_default": a.is_default,
                "order_index": a.order_index,
                "enabled_tools": a.enabled_tools,
                "enabled_skills": a.enabled_skills,
            })
        })
        .collect();
    write_json(&base.join("agents.json"), &json!(agents_json))?;

    // 2. models.json — 只包含已启用的 provider，不写入明文 API Key（安全考虑）
    let models_json: Vec<Value> = providers
        .iter()
        .filter(|p| p.is_enabled)
        .map(|p| {
            json!({
                "name": p.name,
                "api": p.api,
                "base_url": p.base_url,
                "is_enabled": p.is_enabled,
            })
        })
        .collect();
    write_json(&base.join("models.json"), &json!(models_json))?;

    // 3. channels.json
    let channels_json: Vec<Value> = channels
        .iter()
        .map(|c| {
            json!({
                "id": c.id,
                "channel_type": c.channel_type,
                "is_enabled": c.is_enabled,
                "is_connected": c.is_connected,
            })
        })
        .collect();
    write_json(&base.join("channels.json"), &json!(channels_json))?;

    // 4. bindings.json
    let bindings_json: Vec<Value> = bindings
        .iter()
        .map(|b| {
            json!({
                "id": b.id,
                "channel_id": b.channel_id,
                "agent_id": b.agent_id,
                "trigger_mode": b.trigger_mode,
                "is_enabled": b.is_enabled,
            })
        })
        .collect();
    write_json(&base.join("bindings.json"), &json!(bindings_json))?;

    // 5. Agent 文档文件
    let agents_dir = base.join("agents");
    std::fs::create_dir_all(&agents_dir)?;
    for a in &agents {
        let slug = to_slug(&a.name);
        let agent_dir = agents_dir.join(&slug);
        std::fs::create_dir_all(&agent_dir)?;
        write_agent_documents(pool, &a.id, &agent_dir)?;
    }

    // 6. 更新全局 config.json（标记当前 OPC）
    if opc.is_active {
        let global_dir = opc_dir("")?;
        std::fs::create_dir_all(&global_dir)?;
        let global_config_path = global_dir.join("config.json");
        let global = json!({
            "current_opc": opc.name,
            "version": "1.0.0",
            "last_updated": chrono::Utc::now().timestamp(),
        });
        write_json(&global_config_path, &global)?;
    }

    Ok(base)
}

/// 将 agent 文档写入文件
fn write_agent_documents(pool: &DbPool, agent_id: &str, dir: &Path) -> Result<()> {
    let doc_types = ["soul", "identity", "agents", "user", "memory", "heartbeat", "tools"];
    for doc_type in doc_types {
        match agent_service::get_agent_document(pool, agent_id, doc_type) {
            Ok(content) => {
                if !content.is_empty() {
                    let filename = format!("{}.md", doc_type.to_uppercase());
                    std::fs::write(dir.join(&filename), &content)?;
                }
            }
            Err(AppError::NotFound(_)) => {} // 文档为空，跳过
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// 写入 JSON 文件
fn write_json(path: &Path, value: &Value) -> Result<()> {
    let content = serde_json::to_string_pretty(value)?;
    std::fs::write(path, content).map_err(AppError::Io)
}

/// 将名称转为文件系统安全的 slug
fn to_slug(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else if c == ' ' {
                '_'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

/// 验证生成的配置是否完整
pub fn validate_config(opc_name: &str) -> Result<()> {
    let base = opc_dir(opc_name)?;
    for required in &["agents.json", "models.json", "channels.json", "bindings.json"] {
        if !base.join(required).exists() {
            return Err(AppError::Validation(format!(
                "配置文件 {} 不存在",
                required
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_slug() {
        // 纯非 ASCII 字符全部转为下划线，trim 后得到空字符串
        assert_eq!(to_slug("产品经理"), "");
        assert_eq!(to_slug("product_manager"), "product_manager");
        assert_eq!(to_slug("Product Manager"), "product_manager");
        // "UX设计师" → "ux___" → trim 尾部下划线 → "ux"
        assert_eq!(to_slug("UX设计师"), "ux");
    }
}
