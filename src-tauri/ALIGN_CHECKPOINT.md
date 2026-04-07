# Tauri ↔ Server 对齐检查点

下次对齐时，从这个 commit 开始查看 server 端变更：

```
git log e1bb524..HEAD -- server/routes/
```

## 记录

| 日期 | Commit | PR | 对齐内容 |
|------|--------|----|----------|
| 2026-04-07 | `e1bb524` | [#13](https://github.com/hashibit/ClawPilot/pull/13) | **大规模 schema 对齐**：tools/skills 表 INTEGER id、删除 opc_defaults、office_id 修复、ProcessStatus 3 字段、AgentConfig guardrail_allow/deny |
| 2026-04-07 | `dd80df8` | — | DaemonHealthResult.not_installed、SshAuthResult.sudo_ok、InstallDaemonResult.daemon_url/api_key/already_running、deployment 401 重试/state 兼容（server-only） |
| 2026-04-06 | `6fd29b6` | [#11](https://github.com/hashibit/ClawPilot/pull/11) | settings/opc_root、sync_skills、openclaw config v2、activities WebSocket |
| 2026-04-06 | `cc61608` | — | activities SSE/WS、deploy package 结构、$include OPC/ 路径、initial_openclaw_config、undeploy reset、agents_defaults.workspace |
