# ClawPilot Plans.md

创建日：2026-03-16 | 更新日：2026-03-20
**已完成阶段** → [docs/plans-archive.md](./docs/plans-archive.md)（Phase 0–9 全部 DONE）

---

## Phase 9：安装物业 & 真实部署打通（DONE）

> **开发约束**：服务端逻辑走 `src-tauri/src/services/`（Rust，axum 暴露），UI 走 `src/pages/`。
> **参考文档**：[docs/tech/install-property.md](./docs/tech/install-property.md)
> **历史注**：本 Phase 当时使用 Node.js Server（`server/`），现已统一迁移至 Rust 后端；下文 `server/routes/*.js` 路径为历史实现，功能已等价实现于 `src-tauri/src/services/`。

### Feature E：OpenClaw 安装路由

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| E.1 | `server/routes/office.js` — POST `/api/install_openclaw` 本机模式：`curl install.sh \| bash` + `openclaw onboard --non-interactive --install-daemon --skip-skills --skip-health --accept-risk`，日志 SSE 实时流 | 本机 `openclaw --version` 有输出，日志含 `✅` | - | cc:完了 |
| E.2 | SSH 模式：通过 SSH 在远程机执行相同步骤，ssh opts 与 `install_daemon` 共用（host/port/user/key） | SSH 到 OrbStack 虚拟机后 `openclaw --version` 可执行，日志实时回传 | E.1 | cc:完了 |

### Feature F：OPC 配置包生成

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| F.1 | `server/routes/deployment.js` — POST `/api/generate_openclaw_config`：从 DB 生成 `openclaw.json`，workspace=`~/.openclaw/OPC/<opc.display_name>/workspace-<agent.display_name>` | `agents.list` 数=DB agents 行数，models/channels 字段存在 | Phase 8 Done | cc:完了 |
| F.2 | POST `/api/build_deploy_package`：调现有 `buildDeployPackage`，将 openclaw.json 写入包，返回 `{ checksum }` | 解压包含 `manifest.json` + `openclaw.json` + agents md + skills 目录 | F.1 | cc:完了 |

### Feature G：OpcPage 打通真实 Daemon 部署

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| G.1 | POST `/api/deploy_to_office`：生成包 → multipart POST 到 `daemon/deploy` → 轮询 daemon task_id → 回写 `deployment_tasks` | DB status 流转 PENDING→RUNNING→SUCCESS，daemon `GET /deploy/:id` 可验证 | F.2 | cc:完了 |
| G.2 | `src/pages/OpcPage.tsx`：部署按钮调 `deploy_to_office`；office 无 daemon_url 时提示「请先安装物业」，不进入仿真 | 有 daemon 的 office 部署后远程 `~/.openclaw/OPC/<id>/openclaw.json` 存在；无 daemon 时 UI 提示正确 | G.1 | cc:完了 |

### Feature H：OfficePage 两步安装向导

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| H.1 | `OfficePage.tsx` — `InstallPropertyModal` 升级为两步向导（① ② 步骤指示器），SSH 参数两步共用 | Modal 渲染两步，Step1 完成后 Step2 按钮解锁 | E.1, E.2 | cc:完了 |
| H.2 | Step1「安装 OpenClaw」：调 `install_openclaw`，日志轮询实时滚动，成功显示 `✅` | UI 日志实时更新，完成有成功标记 | H.1 | cc:完了 |
| H.3 | Step2「安装 Daemon」：调 `install_daemon`，完成后 daemon_url + api_key 自动回填，提示「点击保存生效」 | offices 表 daemon_url 已更新，「检测连接」显示在线 badge | H.1 | cc:完了 |

---

## Phase 9 测试结果（OrbStack 端到端）✅

> 测试日期：2026-03-20

| ID | 验证目标 | 结果 |
|----|----------|------|
| T0 | OrbStack 环境（test-clawpilot + server） | ✅ |
| TE.1 | install_openclaw SSH 幂等 | ✅ ok:true，日志含 `✅ OpenClaw 已安装，跳过` |
| TE.2 | openclaw --version 远程可执行 | ✅ OpenClaw 2026.3.13 |
| TE.3 | openclaw-gateway.service active | ✅ active (running) |
| TE.4 | 重复调用幂等 | ✅ |
| TF.1 | generate_openclaw_config 格式正确 | ✅ |
| TF.2 | build_deploy_package 返回 checksum | ✅ |
| TG.1 | install_daemon → daemon health ok | ✅ `{"status":"ok"}` |
| TG.2 | deploy_to_office 返回 task_id | ✅ |
| TG.3 | 轮询 SUCCESS ≤ 60s | ✅ 4s |
| TG.4 | 远程 openclaw.json 存在 | ✅ `~/.openclaw/OPC/<id>/openclaw.json` |
| TG.5 | backup 目录存在 | ✅ 时间戳命名备份 |
| TH | OfficePage 两步向导 UI（TypeScript 编译通过） | ✅ |

### 修复记录

- `install_daemon`：新增 `daemon_host` 参数支持 OrbStack 格式 SSH host
- `install_openclaw`：`remoteCmd()` helper 单引号包裹防止 `$PATH` 本地展开
- `OPENCLAW_NO_PROMPT=1 OPENCLAW_NO_ONBOARD=1` 跳过 TTY 交互
- `src/lib/types.ts`：`ChannelType` 补 `'SLACK'`
- `stripAnsi()`：server 侧过滤 ANSI 转义码 + CR 字符，防止 JSON 非法控制字符
- install_openclaw 超时 120s → 300s（npm install 首次耗时约 2 分钟）
