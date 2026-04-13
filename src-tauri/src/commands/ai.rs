use std::sync::LazyLock;

use tauri::State;

use crate::database::helpers;
use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

/// Cached regex for extracting JSON from markdown code blocks.
static JSON_CODE_BLOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"```(?:json)?\s*([\s\S]*?)```").expect("invalid regex pattern")
});

/// AI 生成的 Agent 配置结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiGeneratedAgent {
    pub display_name: String,
    pub name: String,
    pub job_title: String,
    pub description: String,
    pub personality: String,
    pub guardrail_allow: Vec<String>,
    pub guardrail_deny: Vec<String>,
    pub enabled_tools: Vec<String>,
    pub enabled_skills: Vec<String>,
    pub soul: String,
    pub identity: String,
    pub agents: String,
    pub user: String,
    pub memory: String,
    pub heartbeat: String,
    pub tools: String,
}

/// 聊天消息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 聊天响应
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatResponse {
    pub reply: String,
}

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

const SYSTEM_PROMPT: &str = r#"/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置。

可选工具 ID（enabled_tools 从中选择合适的，数组）：
web_search（网页搜索）、web_reader（网页阅读）、feishu_message（发飞书消息）、code_interpreter（代码解释器）、file_reader（文件读取）、image_gen（图像生成）、image_analysis（视觉理解）、http_request（HTTP 请求）、asr（语音识别）、tts（语音合成）

可选技能 slug（enabled_skills 从中选择合适的，数组）：
核心技能：multi-round-memory（多轮记忆）、proactive-speak（主动发言）、scheduled-heartbeat（定时心跳）、mention-response（被@响应）、direct-response（私信响应）、message-routing（消息路由）、context-compression（上下文压缩）、tool-calling（工具调用）、memory-persistence（记忆持久化）、emotional-aware（情绪感知）
扩展技能：github-helper（GitHub 助手）、web-search（网页搜索）、feishu-helper（飞书助手）

严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "显示名称（2-8 字，中文）",
  "name": "英文标识（小写字母 + 下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔，如：细腻、严谨、主动",
  "guardrail_allow": ["允许自主执行的操作，每条简短短语"],
  "guardrail_deny": ["禁止或须请示的操作，每条简短短语"],
  "enabled_tools": ["根据角色职能选择合适的工具 ID，数组"],
  "enabled_skills": ["根据角色行为选择合适的技能 slug，数组"],
  "soul": "SOUL.md 完整内容（Markdown，包含：身份定位 + 核心职责列表 + Boss/定位/emoji + 记忆管理规则 + 权限护栏，按角色特点详细撰写）",
  "identity": "IDENTITY.md 内容（列出 Name/Title/Persona/Role/Emoji/Boss 字段）",
  "agents": "AGENTS.md 内容（Markdown，包含成员编制表占位 + Every Session 阅读清单 + Memory 规则 + Safety 原则）",
  "user": "USER.md 内容（简短：Boss 是唯一汇报对象，可加一句 Boss 偏好）",
  "memory": "MEMORY.md 内容（Markdown，包含置信度图例 + 关于 Boss/项目/经验教训三个空章节）",
  "heartbeat": "HEARTBEAT.md 内容（注释说明 heartbeat 用途，默认为空）",
  "tools": "TOOLS.md 内容（说明用途：记录常用工具和使用心得）"
}

guardrail 规范：每条 3-10 字的短语，允许 3-6 条，禁止 3-5 条，按角色职能定制。
只输出 JSON，不要有任何其他内容。"#;

const SYSTEM_PROMPT_MULTI: &str = r#"/no_think 你是一个 OpenClaw Agent 团队配置生成器。根据用户的描述，生成完整的团队配置。

每个智能体配置包含以下字段：
{
  "display_name": "显示名称（2-8 字，中文）",
  "name": "英文标识（小写字母 + 下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔",
  "guardrail_allow": ["允许自主执行的操作"],
  "guardrail_deny": ["禁止或须请示的操作"],
  "enabled_tools": ["工具 ID 数组"],
  "enabled_skills": ["技能 slug 数组"],
  "soul": "SOUL.md 内容",
  "identity": "IDENTITY.md 内容",
  "agents": "AGENTS.md 内容",
  "user": "USER.md 内容",
  "memory": "MEMORY.md 内容",
  "heartbeat": "HEARTBEAT.md 内容",
  "tools": "TOOLS.md 内容"
}

严格以 JSON 数组格式返回，每个元素是一个完整的智能体配置。不要有任何其他内容。"#;

// ─── Private helpers ─────────────────────────────────────────────────────────

/// Send a system+user prompt to the configured LLM provider and return raw text.
async fn call_llm(
    pool: &DbPool,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
    timeout_secs: u64,
) -> Result<String> {
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
        let data: serde_json::Value = resp
            .json()
            .await
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
        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("解析响应失败：{}", e)))?;
        Ok(data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}

/// Send a pre-built messages array to the LLM (OpenAI-compatible format only).
async fn call_llm_chat(
    pool: &DbPool,
    messages: Vec<serde_json::Value>,
    max_tokens: u32,
) -> Result<String> {
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

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("解析响应失败：{}", e)))?;

    Ok(data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}

/// Extract and parse JSON from a raw LLM response (handles markdown code blocks).
fn extract_json(raw_text: &str) -> Result<serde_json::Value> {
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

fn parse_string_array(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

fn parse_filtered_array(
    value: &serde_json::Value,
    valid: &std::collections::HashSet<&str>,
) -> Vec<String> {
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

/// Parse a single JSON object into an `AiGeneratedAgent`.
/// `idx` is the zero-based position in a batch (used as fallback for `name`).
fn parse_agent(parsed: &serde_json::Value, idx: usize) -> AiGeneratedAgent {
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

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// 使用配置的 AI 提供商生成 Agent 配置
#[tauri::command]
pub async fn ai_generate_agent(pool: State<'_, DbPool>, prompt: String) -> Result<AiGeneratedAgent> {
    if prompt.trim().is_empty() {
        return Err(AppError::Validation("prompt is required".to_string()));
    }

    let raw_text = call_llm(&pool, SYSTEM_PROMPT, &prompt, 2048, 120).await?;
    let parsed = extract_json(&raw_text)?;
    Ok(parse_agent(&parsed, 0))
}

/// 一次性生成多个 Agent 配置
#[tauri::command]
pub async fn ai_generate_agents(
    pool: State<'_, DbPool>,
    prompts: Option<Vec<String>>,
    prompt: Option<String>,
) -> Result<Vec<AiGeneratedAgent>> {
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

    let raw_text = call_llm(&pool, SYSTEM_PROMPT_MULTI, &user_prompt, 4096, 180).await?;
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

/// 与 Agent 对话（使用 model_providers_v2 中的 bailian）
#[tauri::command]
pub async fn chat_with_agent(
    pool: State<'_, DbPool>,
    agent_id: Option<String>,
    messages: Vec<ChatMessage>,
    soul_override: Option<String>,
) -> Result<ChatResponse> {
    if messages.is_empty() {
        return Err(AppError::Validation("messages is required".to_string()));
    }

    // 构建系统提示
    let system_prompt = if let Some(ref soul) = soul_override {
        format!("/no_think\n\n{}", soul)
    } else if let Some(ref aid) = agent_id {
        let doc: Option<String> = match pool
            .get()?
            .query_row(
                "SELECT content FROM agent_documents WHERE agent_id = ?1 AND document_type = 'SOUL'",
                [aid],
                |row| Ok(row.get::<_, String>(0)?),
            ) {
            Ok(content) => Some(content),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(AppError::Database(e)),
        };

        let agent_info: Option<(String, String)> = match pool
            .get()?
            .query_row(
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

    let messages_json: Vec<serde_json::Value> = std::iter::once(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }))
    .chain(messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": m.content
        })
    }))
    .collect();

    let reply = call_llm_chat(&pool, messages_json, 2048).await?;
    Ok(ChatResponse { reply })
}
