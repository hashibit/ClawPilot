/// ai_test.rs
/// AI 命令测试
/// 注意：AI 命令依赖外部 API，这里主要测试数据结构

#[cfg(test)]
mod tests {
    use crate::commands::ai::{AiGeneratedAgent, ChatMessage, ChatResponse};

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_ai_generated_agent_serde_roundtrip() {
        let agent = AiGeneratedAgent {
            display_name: "测试助手".to_string(),
            name: "test_assistant".to_string(),
            job_title: "开发工程师".to_string(),
            description: "一个测试用的助手".to_string(),
            personality: "友好、细致".to_string(),
            guardrail_allow: vec!["读取文件".to_string(), "搜索网络".to_string()],
            guardrail_deny: vec!["删除文件".to_string()],
            enabled_tools: vec!["web_search".to_string(), "file_reader".to_string()],
            enabled_skills: vec!["multi-round-memory".to_string()],
            soul: "SOUL.md content\n\n你是一个测试助手。".to_string(),
            identity: "IDENTITY.md content\n\nName: Test Assistant".to_string(),
            agents: "AGENTS.md content\n\nTeam members.".to_string(),
            user: "USER.md content\n\nBoss preferences.".to_string(),
            memory: "MEMORY.md content\n\nMemory rules.".to_string(),
            heartbeat: "HEARTBEAT.md content\n\nHeartbeat config.".to_string(),
            tools: "TOOLS.md content\n\nTool usage.".to_string(),
        };

        let json = serde_json::to_string(&agent).expect("serialize failed");
        let decoded: AiGeneratedAgent = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.display_name, agent.display_name);
        assert_eq!(decoded.name, agent.name);
        assert_eq!(decoded.guardrail_allow, agent.guardrail_allow);
        assert_eq!(decoded.enabled_tools, agent.enabled_tools);
    }

    #[test]
    fn test_ai_generated_agent_from_json() {
        let json = r##"{
            "display_name": "Alice",
            "name": "alice",
            "job_title": "产品助理",
            "description": "产品团队助手",
            "personality": "主动、细致",
            "guardrail_allow": ["创建文档", "发送通知"],
            "guardrail_deny": ["删除数据"],
            "enabled_tools": ["web_search", "feishu_message"],
            "enabled_skills": ["proactive-speak"],
            "soul": "SOUL content",
            "identity": "IDENTITY content",
            "agents": "AGENTS content",
            "user": "USER content",
            "memory": "MEMORY content",
            "heartbeat": "HEARTBEAT content",
            "tools": "TOOLS content"
        }"##;

        let decoded: AiGeneratedAgent = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.display_name, "Alice");
        assert_eq!(decoded.guardrail_allow.len(), 2);
    }

    #[test]
    fn test_ai_generated_agent_minimal() {
        let json = r#"{
            "display_name": "",
            "name": "minimal",
            "job_title": "",
            "description": "",
            "personality": "",
            "guardrail_allow": [],
            "guardrail_deny": [],
            "enabled_tools": [],
            "enabled_skills": [],
            "soul": "",
            "identity": "",
            "agents": "",
            "user": "",
            "memory": "",
            "heartbeat": "",
            "tools": ""
        }"#;

        let decoded: AiGeneratedAgent = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.display_name.is_empty());
        assert!(decoded.guardrail_allow.is_empty());
    }

    // ─── ChatMessage 测试 ───────────────────────────────────────────

    #[test]
    fn test_chat_message_serde() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: "你好，请帮我生成一个 Agent 配置".to_string(),
        };

        let json = serde_json::to_string(&message).expect("serialize failed");
        let decoded: ChatMessage = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.role, "user");
        assert_eq!(decoded.content, "你好，请帮我生成一个 Agent 配置");
    }

    #[test]
    fn test_chat_message_from_json() {
        let json = r#"{"role": "assistant", "content": "好的，我来帮你生成。"}"#;
        let decoded: ChatMessage = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.role, "assistant");
    }

    #[test]
    fn test_chat_message_array() {
        let json = r#"[
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好！有什么可以帮助你的？"},
            {"role": "user", "content": "生成一个 Agent"}
        ]"#;

        let messages: Vec<ChatMessage> = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    // ─── ChatResponse 测试 ───────────────────────────────────────────

    #[test]
    fn test_chat_response_serde() {
        let response = ChatResponse {
            reply: "这是 AI 的回复内容。".to_string(),
        };

        let json = serde_json::to_string(&response).expect("serialize failed");
        let decoded: ChatResponse = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.reply, "这是 AI 的回复内容。");
    }

    #[test]
    fn test_chat_response_from_json() {
        let json = r#"{"reply": "AI response here"}"#;
        let decoded: ChatResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.reply, "AI response here");
    }

    #[test]
    fn test_chat_response_empty_reply() {
        let json = r#"{"reply": ""}"#;
        let decoded: ChatResponse = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.reply.is_empty());
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_ai_generated_agent_with_long_content() {
        let long_soul = "SOUL.md\n\n".to_string() + &"这是一段很长的内容。".repeat(1000);
        let agent = AiGeneratedAgent {
            display_name: "Long Content Agent".to_string(),
            name: "long_agent".to_string(),
            job_title: "测试".to_string(),
            description: "长内容测试".to_string(),
            personality: "耐心".to_string(),
            guardrail_allow: vec![],
            guardrail_deny: vec![],
            enabled_tools: vec![],
            enabled_skills: vec![],
            soul: long_soul.clone(),
            identity: String::new(),
            agents: String::new(),
            user: String::new(),
            memory: String::new(),
            heartbeat: String::new(),
            tools: String::new(),
        };

        let json = serde_json::to_string(&agent).expect("serialize failed");
        let decoded: AiGeneratedAgent = serde_json::from_str(&json).expect("deserialize failed");

        assert!(decoded.soul.len() > 10000);
    }

    #[test]
    fn test_chat_message_with_special_characters() {
        let json = r#"{"role": "user", "content": "测试 特殊字符 换行 \"引号\""}"#;
        let decoded: ChatMessage = serde_json::from_str(json).expect("deserialize failed");
        assert!(decoded.content.contains("测试"));
    }
}