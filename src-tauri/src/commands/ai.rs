use tauri::State;

use crate::database::pool::DbPool;
use crate::error::{AppError, Result};

/// AI 生成的 Agent 配置结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiGeneratedAgent {
    pub display_name: String,
    pub name: String,
    pub job_title: String,
    pub description: String,
    pub personality: String,
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

/// 使用百炼 AI 生成 Agent 配置
#[tauri::command]
pub async fn ai_generate_agent(pool: State<'_, DbPool>, prompt: String) -> Result<AiGeneratedAgent> {
    use std::time::Duration;

    if prompt.trim().is_empty() {
        return Err(AppError::Validation("prompt is required".to_string()));
    }

    // 获取百炼配置
    let row = pool
        .get()?
        .query_row(
            "SELECT api_key, endpoint FROM model_providers WHERE provider_type = 'BAILIAN'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("BAILIAN 未配置".to_string())
            }
            other => AppError::Database(other),
        })?;

    let api_key = row.0;
    let base_url = row.1.unwrap_or_else(|| "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string());

    if api_key.is_empty() {
        return Err(AppError::Validation(
            "BAILIAN 未配置 API Key，请先在模型管理页完成配置并测试连接".to_string(),
        ));
    }

    let base_url = base_url.trim_end_matches('/');
    let is_anthropic_url = base_url.contains("anthropic");
    let model = "qwen3.5-plus";

    let system_prompt = r#"/no_think 你是一个 OpenClaw Agent 人格配置生成器。根据用户的描述，生成完整的 Agent 配置，包含 7 个人格文档。

严格以 JSON 格式返回，包含以下字段：
{
  "display_name": "显示名称（2-8 字，中文）",
  "name": "英文标识（小写字母 + 下划线，如 ux_designer）",
  "job_title": "职位名称",
  "description": "一句话描述",
  "personality": "性格关键词，逗号分隔，如：细腻、严谨、主动",
  "soul": "SOUL.md 完整内容（Markdown，包含：身份定位 + 核心职责列表 + Boss/定位/emoji + 记忆管理规则 + 权限护栏，按角色特点详细撰写）",
  "identity": "IDENTITY.md 内容（列出 Name/Title/Persona/Role/Emoji/Boss 字段）",
  "agents": "AGENTS.md 内容（Markdown，包含成员编制表占位 + Every Session 阅读清单 + Memory 规则 + Safety 原则）",
  "user": "USER.md 内容（简短：Boss 是唯一汇报对象，可加一句 Boss 偏好）",
  "memory": "MEMORY.md 内容（Markdown，包含置信度图例 + 关于 Boss/项目/经验教训三个空章节）",
  "heartbeat": "HEARTBEAT.md 内容（注释说明 heartbeat 用途，默认为空）",
  "tools": "TOOLS.md 内容（说明用途：记录常用工具和使用心得）"
}

SOUL.md 重要规范：
- 权限护栏内允许：查询搜索读取、写日记/记忆、生成报告草稿、发飞书消息、加角色专属自主范围
- 权限护栏外须请示：删除数据文件、不可逆操作、对外正式文件、加角色专属限制
- 按角色类型适配护栏内容（财务类：生成报告允许，转账禁止；合规类：查阅法规允许，发正式意见禁止等）

只输出 JSON，不要有任何其他内容。"#;

    let endpoint = if is_anthropic_url {
        format!("{}/v1/messages", base_url)
    } else {
        format!("{}/chat/completions", base_url)
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    let raw_text = if is_anthropic_url {
        // Anthropic 格式
        let resp = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "system": system_prompt,
                "messages": [{ "role": "user", "content": prompt }],
                "max_tokens": 1024,
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
        data["content"][0]["text"].as_str().unwrap_or("").to_string()
    } else {
        // OpenAI 兼容格式
        let resp = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": prompt }
                ],
                "max_tokens": 2048,
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
        data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string()
    };

    // 解析 JSON
    let parsed: serde_json::Value = serde_json::from_str(&raw_text)
        .or_else(|_| {
            // 尝试提取 markdown 代码块中的 JSON
            if let Some(m) = regex::Regex::new(r"```(?:json)?\s*([\s\S]*?)```")
                .unwrap()
                .captures(&raw_text)
            {
                serde_json::from_str(&m[1])
            } else {
                serde_json::from_str(&raw_text)
            }
        })
        .map_err(|e| {
            AppError::Internal(format!(
                "JSON 解析失败：{}\n原始响应：{}",
                e,
                raw_text.chars().take(300).collect::<String>()
            ))
        })?;

    let result = AiGeneratedAgent {
        display_name: parsed["display_name"].as_str().unwrap_or("").to_string(),
        name: parsed["name"]
            .as_str()
            .unwrap_or("")
            .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
            .to_lowercase(),
        job_title: parsed["job_title"].as_str().unwrap_or("").to_string(),
        description: parsed["description"].as_str().unwrap_or("").to_string(),
        personality: parsed["personality"].as_str().unwrap_or("").to_string(),
        soul: parsed["soul"].as_str().unwrap_or("").to_string(),
        identity: parsed["identity"].as_str().unwrap_or("").to_string(),
        agents: parsed["agents"].as_str().unwrap_or("").to_string(),
        user: parsed["user"].as_str().unwrap_or("").to_string(),
        memory: parsed["memory"].as_str().unwrap_or("").to_string(),
        heartbeat: parsed["heartbeat"].as_str().unwrap_or("").to_string(),
        tools: parsed["tools"].as_str().unwrap_or("").to_string(),
    };

    Ok(result)
}

/// 与 Agent 对话
#[tauri::command]
pub async fn chat_with_agent(
    pool: State<'_, DbPool>,
    agent_id: Option<String>,
    messages: Vec<ChatMessage>,
    soul_override: Option<String>,
) -> Result<ChatResponse> {
    use std::time::Duration;

    if messages.is_empty() {
        return Err(AppError::Validation("messages is required".to_string()));
    }

    // 构建系统提示
    let system_prompt = if let Some(ref soul) = soul_override {
        format!("/no_think\n\n{}", soul)
    } else if let Some(ref aid) = agent_id {
        // 从数据库加载 SOUL.md
        let doc: Option<String> = match pool
            .get()?
            .query_row(
                "SELECT content FROM agent_documents WHERE agent_id = ?1 AND document_type = 'SOUL'",
                [aid],
                |row| Ok(row.get::<_, String>(0)?),
            )
        {
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
            )
        {
            Ok(info) => Some(info),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(AppError::Database(e)),
        };

        let mut prompt = "/no_think 你是一个 OpenClaw Agent。".to_string();
        if let Some((name, title)) = agent_info {
            prompt.push_str(&format!(" 你的名字是 {}", name));
            prompt.push_str(&format!(", 职位是 {}", title));
        }
        prompt.push('.');
        if let Some(content) = doc {
            prompt = format!("/no_think\n\n{}", content);
        }
        prompt
    } else {
        return Err(AppError::Validation(
            "agent_id is required when soul_override is not provided".to_string(),
        ));
    };

    // 获取百炼配置
    let row = pool
        .get()?
        .query_row(
            "SELECT api_key, endpoint, is_coding_plan FROM model_providers WHERE provider_type = 'BAILIAN' AND is_enabled = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                ))
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("BAILIAN 未配置或未启用".to_string())
            }
            other => AppError::Database(other),
        })?;

    let api_key = row.0;
    let base_url = row.1.unwrap_or_else(|| "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string());
    let is_coding_plan = row.2 != 0;

    if api_key.is_empty() {
        return Err(AppError::Validation(
            "BAILIAN 未配置 API Key，请先在模型管理页完成配置".to_string(),
        ));
    }

    let model = "qwen3.5-plus";
    let endpoint = if is_coding_plan {
        "https://coding.dashscope.aliyuncs.com/v1/chat/completions".to_string()
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    let messages_json: Vec<serde_json::Value> = std::iter::once(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }))
    .chain(messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": &m.content
        })
    }))
    .collect();

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model,
            "messages": messages_json,
            "max_tokens": 2048,
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

    let reply = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(ChatResponse { reply })
}

