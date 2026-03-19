# 技能下载与安装功能

**创建日期**: 2026-03-19  
**优先级**: P0

---

## 问题描述

### 当前状态
- ❌ 技能只存在于数据库中（元数据），没有实际文件
- ❌ `sync_skills_from_clawhub()` 是空实现
- ❌ 部署包无法打包技能实现（只有元数据，不是完整离线包）

### 需要实现
- ✅ 从 ClawHub 下载技能文件到本地目录
- ✅ 技能以目录形式存储（包含 SKILL.md, index.js, package.json 等）
- ✅ 部署包打包实际技能文件（完整离线包）
- ✅ Daemon 解压到正确位置

---

## 目录结构

### Tauri App (客户端)
```
~/.clawpilot/
├── clawpilot.db
└── skills/                 # ← 技能目录
    ├── feishu-doc/
    │   ├── SKILL.md
    │   ├── index.js
    │   └── package.json
    └── {skill_slug}/
```

### 部署包
```
deployment-package.tar.gz
└── skills/
    └── {skill_slug}/
        ├── SKILL.md
        ├── index.js
        └── ...
```

### Daemon 解压后
```
~/.openclaw/OPC/{opc_id}/
└── skills/
    └── {skill_slug}/
```

---

## 功能需求

### 1. 技能安装
- 从 ClawHub 下载技能（zip 格式）
- 解压到 `~/.clawpilot/skills/{slug}/`
- 更新数据库标记为已安装

### 2. 技能卸载
- 删除 `~/.clawpilot/skills/{slug}/` 目录
- 更新数据库标记为未安装

### 3. 技能同步
- 从 ClawHub 获取可用技能列表
- 保存到数据库（元数据）

### 4. 部署包集成
- 扫描 `~/.clawpilot/skills/` 目录
- 打包所有已安装技能的实际文件

### 5. Daemon 解压
- 解压部署包到 `~/.openclaw/OPC/{opc_id}/skills/`

---

## API 需求

### ClawHub API
```
GET https://clawhub.ai/api/skills
GET https://clawhub.ai/api/skills/{slug}/download
```

### Tauri Commands
```rust
get_installed_skills() -> Vec<SkillInfo>
sync_skills_from_clawhub() -> Vec<SkillMetadata>
install_skill(slug: String) -> SkillInfo
uninstall_skill(slug: String) -> ()
update_skill(slug: String) -> SkillInfo
```

---

## 数据库扩展

skills 表需要新增字段：
- `slug` - 技能 slug（目录名）
- `author` - 作者
- `version` - 版本号
- `url` - ClawHub URL
- `download_url` - 下载链接
- `tags` - 标签（JSON）
- `installed_at` - 安装时间
- `is_installed` - 是否已安装

---

## 依赖

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
zip = "0.6"
```

---

## 测试流程

1. 启动 Tauri App
2. 打开技能页面，点击"同步"
3. 选择一个技能点击"安装"
4. 验证 `~/.clawpilot/skills/{slug}/` 目录存在
5. 点击部署 OPC
6. 验证部署包包含 `skills/` 目录
7. 验证 Daemon 解压后技能文件完整

---

## 时间估算

- 数据库迁移：30 分钟
- 技能下载服务：2 小时
- Tauri Commands：1 小时
- 前端 UI：2 小时
- 部署包集成：1 小时
- Daemon 解压：30 分钟

**总计**: ~7 小时

---

## 参考文档

- [部署架构设计](./remote-deployment.md)
- [Proto 定义](../proto/clawpilot.proto)
