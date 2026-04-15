# 开发模式与规范

## 开发模式

### 统一后端架构
- **单一 Rust 后端**：所有业务逻辑在 `src-tauri/src/services/`，通过 `http/mod.rs` 暴露为 HTTP API
- 前端通过 `call()` 函数以 HTTP 请求访问 `http://127.0.0.1:16667/api/<cmd>`
- 开发模式下使用独立 dev-server 二进制（`cargo run --bin dev-server`）
- 生产模式（Tauri App）内嵌 axum server，同一进程
- 业务逻辑放 `services/`，HTTP 路由层放 `http/`，不在路由层写 SQL

### 数据模型事实标准
- **`proto/` 目录下的 `.proto` 文件是数据模型的唯一事实标准**
- 所有数据结构（TypeScript 类型、Rust 结构体、SQLite 表结构）必须与 `proto/` 保持一致
- 新增或修改字段时，先改 `.proto`，再同步到其他层

## 开发规范

- API Key 等敏感信息必须通过 `utils/crypto.rs` 加密存储，密钥文件在 `~/.clawpilot/server.key`
- SQL 操作必须使用参数绑定，防止 SQL 注入
- 开发和测试期间，如果端口 16666/16667/16668 被占用，先找到相关进程杀死，再启动服务

## Code Review Standards

After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.
