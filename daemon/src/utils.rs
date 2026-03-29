//! Utility functions for the daemon

/// Extract the first valid JSON object/array from a string that may contain
/// log lines before or after the JSON.
///
/// This handles OpenClaw CLI output which may print log messages mixed with JSON.
/// Supports both object `{...}` and array `[...]` formats.
///
/// The algorithm tries each potential start position ( '[' or '{' ) and validates
/// that it forms a properly balanced JSON structure.
///
/// # Examples
///
/// ```
/// let output = r#"03:25:07 [plugins] Some log
/// [{"id": "agent1"}]
/// 03:25:07 [plugins] More log"#;
/// let json = extract_json(output).unwrap();
/// assert_eq!(json, r#"[{"id": "agent1"}]"#);
/// ```
pub fn extract_json(output: &str) -> Option<String> {
    let trimmed = output.trim();

    // Collect all potential JSON start positions ('[' or '{')
    let mut candidates: Vec<usize> = Vec::new();
    for (i, c) in trimmed.char_indices() {
        if c == '[' || c == '{' {
            candidates.push(i);
        }
    }

    // Try each candidate position
    for start in candidates {
        let start_char = trimmed.chars().nth(start).unwrap();

        // Determine open/close characters
        let (open, close) = if start_char == '{' {
            ('{', '}')
        } else {
            ('[', ']')
        };

        // Find the matching close by counting nesting
        let mut depth = 1;
        let mut found_end = None;

        for (i, c) in trimmed[start + 1..].char_indices() {
            if c == open {
                depth += 1;
            } else if c == close {
                depth -= 1;
                if depth == 0 {
                    found_end = Some(start + 1 + i + 1); // +1 for char after start, +1 for char len
                    break;
                }
            }
        }

        // If we found a balanced structure, validate it by parsing as JSON
        if let Some(end) = found_end {
            let candidate = &trimmed[start..end];
            if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
                return Some(candidate.to_string());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_array_with_trailing_logs() {
        let output = r#"[
  {"id": "agent1"},
  {"id": "agent2"}
]
03:25:07 [plugins] feishu_doc: Registered feishu_doc
03:25:07 [plugins] feishu_chat: Registered feishu_chat"#;

        let result = extract_json(output).unwrap();
        assert!(result.starts_with('['));
        assert!(result.ends_with(']'));
        assert!(result.contains("agent1"));
    }

    #[test]
    fn test_extract_json_object_with_leading_logs() {
        let output = r#"03:28:36 [plugins] feishu_doc: Registered feishu_doc
03:28:36 [plugins] feishu_chat: Registered feishu_chat
{
  "service": {
    "runtime": {
      "status": "running"
    }
  }
}"#;

        let result = extract_json(output).unwrap();
        assert!(result.starts_with('{'));
        assert!(result.ends_with('}'));
        assert!(result.contains("service"));
    }

    #[test]
    fn test_extract_json_object_with_both_logs() {
        let output = r#"03:28:36 [plugins] Some log
{
  "service": {
    "runtime": {
      "status": "running"
    }
  }
}
03:28:36 [plugins] More log"#;

        let result = extract_json(output).unwrap();
        assert!(result.starts_with('{'));
        assert!(result.ends_with('}'));
    }

    #[test]
    fn test_extract_json_nested() {
        let output = r#"[{"id": "a", "config": {"nested": true}}]"#;
        let result = extract_json(output).unwrap();
        assert_eq!(result, r#"[{"id": "a", "config": {"nested": true}}]"#);
    }

    #[test]
    fn test_extract_json_no_json() {
        let output = "Just some log output\nNo JSON here";
        assert!(extract_json(output).is_none());
    }

    #[test]
    fn test_extract_json_empty() {
        assert!(extract_json("").is_none());
    }

    #[test]
    fn test_extract_json_only_whitespace() {
        assert!(extract_json("   \n\t  ").is_none());
    }

    #[test]
    fn test_extract_json_unbalanced_brackets() {
        // [plugins] is not a valid JSON, should be skipped
        let output = r#"[plugins] some log
{"valid": "json"}"#;
        let result = extract_json(output).unwrap();
        assert_eq!(result, r#"{"valid": "json"}"#);
    }

    #[test]
    fn test_extract_json_actual_agents_list_output() {
        // Simulating actual openclaw agents list --json output
        let output = r#"[
  {
    "id": "inet-cto",
    "name": "OPC · CTO",
    "identityName": "CTO",
    "identityEmoji": "🔧",
    "identitySource": "identity",
    "workspace": "/Users/jiechen/.openclaw/OPC/互联网/workspace-cto",
    "agentDir": "/Users/jiechen/.openclaw/agents/inet-cto/agent",
    "model": "bailian/qwen3-coder-plus",
    "bindings": 2,
    "isDefault": true,
    "routes": [
      "default (no explicit rules)"
    ]
  },
  {
    "id": "inet-accountant",
    "name": "OPC · 会计",
    "identityName": "会计",
    "identityEmoji": "📊",
    "identitySource": "identity",
    "workspace": "/Users/jiechen/.openclaw/OPC/互联网/workspace-会计",
    "agentDir": "/Users/jiechen/.openclaw/agents/inet-accountant/agent",
    "model": "bailian/qwen3.5-plus",
    "bindings": 1,
    "isDefault": false
  }
]
03:25:07 [plugins] feishu_doc: Registered feishu_doc
03:25:07 [plugins] feishu_chat: Registered feishu_chat tool"#;

        let result = extract_json(output).unwrap();
        assert!(result.starts_with('['));
        assert!(result.ends_with(']'));
        assert!(result.contains("inet-cto"));
        assert!(result.contains("inet-accountant"));
    }

    #[test]
    fn test_extract_json_actual_gateway_status_output() {
        // Simulating actual openclaw gateway status --json output
        let output = r#"03:28:36 [plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes
03:28:36 [plugins] feishu_chat: Registered feishu_chat tool
03:28:36 [plugins] feishu_wiki: Registered feishu_wiki tool
03:28:36 [plugins] feishu_drive: Registered feishu_drive tool
03:28:36 [plugins] feishu_bitable: Registered bitable tools
{
  "service": {
    "label": "LaunchAgent",
    "loaded": true,
    "loadedText": "loaded",
    "notLoadedText": "not loaded",
    "command": {
      "programArguments": [
        "/opt/homebrew/opt/node/bin/node",
        "/opt/homebrew/lib/node_modules/openclaw/dist/index.js",
        "gateway",
        "--port",
        "18789"
      ],
      "environment": {
        "OPENCLAW_GATEWAY_PORT": "18789"
      },
      "sourcePath": "/Users/jiechen/Library/LaunchAgents/ai.openclaw.gateway.plist"
    },
    "runtime": {
      "status": "running",
      "state": "running",
      "pid": 93310,
      "cachedLabel": false
    },
    "configAudit": {
      "ok": true,
      "issues": []
    }
  },
  "config": {
    "cli": {
      "path": "/Users/jiechen/.openclaw/openclaw.json",
      "exists": true,
      "valid": true
    },
    "daemon": {
      "path": "/Users/jiechen/.openclaw/openclaw.json",
      "exists": true,
      "valid": true
    }
  },
  "gateway": {
    "bindMode": "loopback",
    "bindHost": "127.0.0.1",
    "port": 18789,
    "portSource": "service args",
    "probeUrl": "ws://127.0.0.1:18789",
    "probeNote": "Loopback-only gateway; only local clients can connect."
  },
  "port": {
    "port": 18789,
    "status": "busy",
    "listeners": [
      {
        "pid": 93310,
        "command": "node",
        "address": "127.0.0.1:18789",
        "commandLine": "openclaw-gateway",
        "user": "jiechen",
        "ppid": 1
      }
    ],
    "hints": [
      "Gateway already running locally. Stop it (openclaw gateway stop) or use a different port."
    ]
  },
  "rpc": {
    "ok": true,
    "url": "ws://127.0.0.1:18789"
  },
  "extraServices": []
}"#;

        let result = extract_json(output).unwrap();
        assert!(result.starts_with('{'));
        assert!(result.ends_with('}'));
        assert!(result.contains("service"));
        assert!(result.contains("runtime"));
        assert!(result.contains("running"));
    }
}
