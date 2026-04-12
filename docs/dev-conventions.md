# 开发模式与规范

## 开发模式

### 阶段一：前端 + Server 开发测试
- 日常开发与功能测试使用 **`src/`（React 前端）+ `server/`（Express/Node.js）** 组合
- 前端通过 `call()` 函数以 HTTP 请求访问 `http://localhost:16667/api/<cmd>`
- 后端用 SQLite（better-sqlite3）存储数据，inline `try { db.exec('ALTER TABLE...') } catch {}` 做增量迁移
- 路由文件放 `server/routes/`，每个模块对应一个路由文件

### 阶段二：Tauri 集成
- 功能稳定后再集成到 Tauri GUI App
- `call()` 在 Tauri 环境下自动切换为 `invoke()` 调用 Rust 命令
- Tauri 命令放 `commands/`，业务逻辑放 `services/`，不在命令层写 SQL
- Tauri 命令返回值统一为 `Result<T, AppError>`，错误通过 serde 传递给 JS

### 数据模型事实标准
- **`proto/` 目录下的 `.proto` 文件是数据模型的唯一事实标准**
- 所有数据结构（TypeScript 类型、Rust 结构体、SQLite 表结构）必须与 `proto/` 保持一致
- 新增或修改字段时，先改 `.proto`，再同步到其他层
- 前后端交互接口必须跟 `proto/server-service.proto` 对齐，先改 proto 再改代码
- 检查 Tauri 与 server 一致性时，先校验 tauri 命令是否跟 proto 一致（命令名、参数名、类型、数量）

## 开发规范

- API Key 等敏感信息必须通过 `utils/crypto.rs` 加密存储，密钥文件在 `~/.clawpilot/server.key`
- SQL 操作必须使用参数绑定，防止 SQL 注入
- 开发和测试期间，如果 nodejs 进程有 http-proxy/https-proxy 等环境变量，需要先取消（这些是给 claude 用的）
- 开发和测试期间，如果端口 16666/16667/16668 被占用，先找到相关进程杀死，再启动服务
- API 签名对比：用 `node scripts/compare-api-signatures.js` 验证 Server 和 Tauri 命令的参数签名是否一致

## Code Review Standards

After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.
