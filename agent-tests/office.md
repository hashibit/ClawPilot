# Office 管理 — agent-browser 测试场景

> 由 Claude Code 调用 `agent-browser` skill 执行，或人工逐项验证。

---

## 测试环境准备

### 远程主机（OrbStack VM）

涉及「远程模式」的测试（SSH 连通检测、远程安装物业）需要一台真实的远程主机。
推荐使用 **OrbStack** 在本机创建 Linux VM 代替真实服务器：

```bash
# 查看现有 VM
orbctl list

# 如需新建
orbctl create ubuntu clawpilot-test

# 获取 VM IP
orbctl info clawpilot-test | grep IPv4
```

**一次性配置（首次使用）：**

```bash
# 1. 安装 sshd 并注入 OrbStack 公钥
orbctl run -m clawpilot-test -u root bash -c "apt-get install -y openssh-server && systemctl enable ssh && systemctl start ssh"

PUBKEY=$(cat ~/.orbstack/ssh/id_ed25519.pub)
orbctl run -m clawpilot-test -u root bash -c "
  mkdir -p /home/$USER/.ssh
  echo '$PUBKEY' > /home/$USER/.ssh/authorized_keys
  chown -R $USER:$USER /home/$USER/.ssh
  chmod 700 /home/$USER/.ssh && chmod 600 /home/$USER/.ssh/authorized_keys
"

# 2. 验证
VM_IP=$(orbctl info clawpilot-test | grep IPv4 | awk '{print $2}')
ssh -i ~/.orbstack/ssh/id_ed25519 $USER@$VM_IP "echo ok"
```

**在 UI 中配置 Office 对应 VM：**
- 地址：`$VM_IP`（`orbctl info clawpilot-test | grep IPv4` 查看）
- 认证：SSH 私钥，路径 `~/.orbstack/ssh/id_ed25519`

---

## CRUD

**创建 Office**
1. 进入 `#/office`，点击列表底部「添加办公室」按钮
2. 列表末尾出现「新办公室 N」临时条目，右侧面板进入编辑状态，工具栏显示「未保存」
3. 填写名称后工具栏标题同步更新
4. 点击「保存」，临时条目变为正式条目，「未保存」标记消失

**取消新建**
1. 点击「添加办公室」后点「取消」
2. 临时条目消失，自动选中列表第一个 Office

**编辑 Office**
1. 选中某个 Office，点击「编辑」
2. 修改名称、备注等字段，列表行副标题显示「未保存」（橙色）
3. 点击「保存」，列表名称同步更新，「未保存」消失

**取消编辑**
1. 编辑状态下点「取消」，表单恢复为保存前的值

**删除 Office**
1. 点击「删除」，出现二次确认
2. 确认后该条目从列表消失；若删除的是当前选中项，自动切换到列表第一个
3. 列表为空时右侧显示「请选择一个办公室」提示

---

## 地址模式切换

**切换为「本机」**
1. 编辑状态下点「本机」按钮，按钮高亮（紫色描边）
2. 地址输入框变为禁用且置灰，内容清空
3. 保存成功；若已有另一个 Office 设置为本机，提示冲突错误、保存被阻止

**切换为「远程」**
1. 点「远程」按钮，地址输入框变为可编辑，占位符显示「如：192.168.1.100 或云主机 IP」
2. 输入 IP 地址或主机名后保存成功
3. 保存时若地址从本机改为远程（或反向），已填写的 Daemon URL / API Key 自动清除

**地址格式校验（在安装物业时触发）**
- 地址为空：提示「请先设置有效的办公室地址」，安装被阻止
- 地址为 `localhost` 或合法 IP / 主机名：可继续安装
- 地址格式非法（如纯文本乱码）：提示错误，安装被阻止

---

## 远程模式：门禁认证

> 切换为「远程」后，基本信息区展开「门禁」配置行

**密码认证（默认）**
1. 「密码」按钮高亮，显示「用户名」和「密码」两个输入框
2. 填写用户名和密码后保存

**SSH 密钥认证**
1. 点击「SSH 密钥」按钮，隐藏密码框，显示「密钥路径」输入框
2. 填写本机密钥路径（如 `~/.ssh/id_rsa`）后保存

**测试 SSH 连接**
> 「测试连接」按钮仅在已保存的（非新建）远程 Office 中显示

- 点击后按钮文字变为「检测中…」，禁用状态
- 成功：按钮右侧绿色文字显示 `✓ XXms`（延迟）
- 失败：红色文字显示 `✗ <错误信息>`

---

## 物业信息区

**安装物业**
- 未保存的新 Office 点击「安装物业」：提示「请先保存办公室后再安装物业」
- 地址无效时点击：提示「请先设置有效的办公室地址」
- 远程模式下：先自动进行 SSH 连通检测，失败则提示「无法连通远程主机」并中止
- 安装中：按钮文字依次显示「正在安装 openclaw…」→「正在安装 daemon…」，按钮禁用
- 安装成功：底部日志区出现绿色「✅」完成行，显示「折叠」按钮
- 安装失败：日志区出现红色「❌」行，可折叠

**安装日志颜色规则**
- `❌` 开头 → 红色
- `✅` / `🔑` / `💾` 开头 → 绿色
- `▶` 开头 → 紫色
- 其他 → 默认色

**Daemon 健康状态**
- 选中已配置 daemon_url 的 Office 时，自动触发健康检查
- 状态点颜色：绿色（运行中）/ 橙色（检测中）/ 灰色（离线）
- 检测中：按钮显示「检测中」，禁用
- 返回成功：显示版本号（如 `v0.1.0`）
- 返回失败：状态点灰色，错误信息以红色小字展示在组内
- 点击「刷新」按钮重新触发健康检查（仅在 daemon_url 已填写时显示该按钮）

---

## 部署信息区

- 当前已部署 OPC：显示绿色状态点 + OPC 名称（可点击跳转至 `#/opc`）
- 未部署：显示「暂无部署」占位文字
- 部署历史列表：每条记录显示状态徽标（运行中 / 已撤销）、OPC 名称、部署时间及撤销时间
