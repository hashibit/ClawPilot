# Changelog

All notable changes to ClawPilot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-03-16

### Added

#### Core Infrastructure
- SQLite connection pool with `r2d2` for thread-safe database access
- Full database schema: OPC, agents, agent documents, model providers, channels, bindings, snapshots, deployment tasks, log entries
- Database migration system with idempotent version-based upgrades
- Rust model structs with `serde` serialization for all domain types
- AES-256-GCM encryption for API key storage via `CLAWPILOT_SECRET_KEY` env var

#### Business Logic (Services)
- **OPC Service**: full CRUD, active/current OPC switching, JSON import/export
- **Agent Service**: CRUD, document management (SOUL/IDENTITY/AGENTS/USER/MEMORY/HEARTBEAT/TOOLS), drag-and-drop reordering
- **Model Service**: provider CRUD with encrypted API key storage, availability testing
- **Channel Service**: channel CRUD, Feishu connection status tracking
- **Binding Service**: binding CRUD, enable/disable toggle
- **Snapshot Service**: OPC state snapshot creation, restore, and deletion
- **Deployment Service**: deployment task lifecycle management (pending → running → succeeded/failed)
- **Log Service**: structured log read with level/component filtering and cleanup

#### Tauri IPC Commands
- 50 `#[tauri::command]` handlers across all domains
- Consistent `AppError` serialization for frontend error handling

#### Frontend UI (HTML/CSS/JS)
- Dark-mode desktop UI with macOS-style sidebar + list + detail layout
- **Overview page**: OPC statistics cards, today's message counts per OPC
- **OPC management**: create/edit/delete/export, set active OPC
- **Agent management**: CRUD, document editor with markdown, tool/skill config
- **Model providers**: provider cards with API key input and connectivity testing
- **Feishu channel bindings**: binding CRUD, channel list, enable/disable toggles
- **One-click deployment**: progress bar, step indicators, real-time log streaming
- **Log viewer**: level/component filter, auto-refresh, export to text
- Shared CSS: toggle switches, drag-and-drop visual feedback, skeleton loading, form validation

#### OpenClaw Integration
- Config generation: OPC → `~/.openclaw/<name>/agents.json`, `models.json`, `channels.json`, `bindings.json`
- Agent document export: SOUL.md, IDENTITY.md, AGENTS.md, USER.md, MEMORY.md, HEARTBEAT.md, TOOLS.md
- Global `config.json` with current active OPC
- Process lifecycle: detect (PID file + `pgrep`), start, stop (`SIGTERM`), reload config (`SIGHUP`)
- Message statistics: today/yesterday counts, growth percentage, per-agent breakdown
- Daily trend with single optimized GROUP BY query

#### Tests
- 136 unit and integration tests (all passing)
- Cross-service integration tests: OPC/Agent isolation, Channel/Binding consistency, NotFound errors, set_current_opc correctness
- Security tests: AES-256-GCM encryption roundtrip, random nonce per encryption

### Infrastructure
- GitHub Actions CI: Rust tests on Ubuntu on every push/PR
- GitHub Actions Release: multi-platform builds (macOS ARM/Intel, Windows x64, Linux AppImage) on version tags
- `tauri.conf.json`: CSP, macOS DMG layout, Linux deb/AppImage/rpm dependencies
