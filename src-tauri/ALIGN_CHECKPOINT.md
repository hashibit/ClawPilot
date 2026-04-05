# Tauri ↔ Server 对齐检查点

下次对齐时，从这个 commit 开始查看 server 端变更：

```
git log cc61608..HEAD -- server/routes/
```

## 记录

| 日期 | Commit | PR | 对齐内容 |
|------|--------|----|----------|
| 2026-04-06 | `6fd29b6` | [#11](https://github.com/hashibit/ClawPilot/pull/11) | settings/opc_root、sync_skills、openclaw config v2、activities WebSocket |
| 2026-04-06 | `cc61608` | — | activities SSE/WS、deploy package 结构、$include OPC/ 路径、initial_openclaw_config、undeploy reset、agents_defaults.workspace |
