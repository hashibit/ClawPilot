# Phase 2: SSH 集成与远程部署

## 已完成
✅ Phase 1: Daemon 基础框架 (编译通过，可运行)

## 新任务

### 1. 更新 systemd 服务文件
位置：`daemon/clawpilot-daemon.service`
✅ 已创建

### 2. 更新安装脚本
位置：`daemon/install-daemon.sh`
✅ 已创建

### 3. SSH 集成 (Tauri App 侧)

在 Tauri App 中实现 SSH 客户端功能，用于远程部署。

#### 3.1 添加 Rust 依赖 (Tauri 项目的 Cargo.toml)
```toml
[dependencies]
openssh = "0.10"  # 或 tokio-ssh = "0.5"
```

#### 3.2 实现 SSH 部署函数
位置：`src-tauri/src/remote_deploy.rs`

```rust
pub async fn deploy_to_remote(
    office: &OfficeConfig,
    package: DeploymentPackage,
) -> Result<DeployResult> {
    // 1. SSH 连接
    let session = openssh::Session::connect(
        format!("{}@{}", office.ssh.user, office.ssh.host),
        openssh::KnownHosts::Strict,
    )
    .await?;

    // 2. scp 上传部署包
    let remote_path = format!("/tmp/deploy-{}.tar.gz", package.opc_id);
    session.scp_copy(&package.buffer, &remote_path).await?;

    // 3. SSH 执行 curl 调用 Daemon API
    let curl_cmd = format!(
        r#"curl -X POST http://localhost:8443/deploy \
          -H "Authorization: Bearer {}" \
          -F "manifest={}" \
          -F "package=@{}""#,
        office.daemon_api_key,
        serde_json::to_string(&package.manifest)?,
        remote_path
    );

    let output = session.command("bash").arg("-c").arg(&curl_cmd).output().await?;
    
    // 4. 解析 task_id
    let response: DeployResponse = serde_json::from_slice(&output.stdout)?;
    
    // 5. 轮询状态
    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let status = get_deploy_status(&session, &office.daemon_api_key, &response.task_id).await?;
        
        match status.status {
            TaskStatus::Success => return Ok(status),
            TaskStatus::Failed => return Err(anyhow!("部署失败：{}", status.error)),
            _ => continue,
        }
    }
}
```

### 4. 办公室配置结构

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OfficeConfig {
    pub id: String,
    pub name: String,
    pub deployment_mode: DeploymentMode,
    
    // 本地模式不需要以下字段
    pub ssh: Option<SshConfig>,
    pub daemon_api_key: Option<String>,  // 加密存储
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentMode {
    Local,   // 同机，直接调用 localhost
    Remote,  // 远程，通过 SSH 隧道
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub user: String,
    pub key_file: String,  // ~/.ssh/id_ed25519
    pub port: u16,
}
```

### 5. 部署路由逻辑

```rust
// src-tauri/src/deploy.rs
pub async fn deploy(opc_id: &str, office_id: &str) -> Result<DeployResult> {
    let office = get_office_config(office_id)?;
    let package = generate_deployment_package(opc_id)?;
    
    match office.deployment_mode {
        DeploymentMode::Local => {
            // 本地部署：直接调用 localhost:8443
            deploy_to_local(&package, &office.daemon_api_key.unwrap()).await
        }
        DeploymentMode::Remote => {
            // 远程部署：通过 SSH 隧道
            deploy_to_remote(&office, package).await
        }
    }
}
```

### 6. 前端 UI 调整

在办公室配置页面增加：
- 部署模式选择：本地 / 远程
- 远程模式时显示 SSH 配置表单：
  - 服务器地址 (host)
  - 用户名 (user)
  - SSH 密钥路径 (key_file)
  - 端口 (port, 默认 22)
- API Key 输入框（远程模式必填）

### 7. 测试流程

1. **本地部署测试**:
   ```bash
   # 启动 Daemon
   ./target/debug/clawpilot-daemon --listen 127.0.0.1:8443
   
   # Tauri App 调用部署
   ```

2. **远程部署测试** (需要真实服务器):
   ```bash
   # 1. SSH 登录服务器
   ssh user@remote-server
   
   # 2. 安装 Daemon
   curl -fsSL https://clawpilot.ai/install-daemon.sh | sudo bash
   
   # 3. 复制 API Key
   
   # 4. Tauri App 配置办公室
   # 5. 执行部署
   ```

## 开始实现
1. 先实现 SSH 集成模块
2. 实现远程部署调用逻辑
3. 更新前端配置页面
4. 测试验证
