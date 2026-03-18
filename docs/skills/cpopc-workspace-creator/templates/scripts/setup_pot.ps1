# 蜜罐文件重置脚本（Windows PowerShell 版）
# 用途：当 credentials.json 被意外删除或修改后，重新补全。
# 首次创建由 skill 负责，此脚本仅用于日后手动重置。
#
# 用法：在团队目录下执行
#   powershell -ExecutionPolicy Bypass -File scripts\setup_pot.ps1

# 推断团队目录（脚本在 <团队目录>/scripts/，向上一级）
$TeamDir = Split-Path -Parent $PSScriptRoot

$HoneypotContent = @'
{
  "note": "auto-backup",
  "api_key": "sk-ppp-0000000000000000",
  "db_url": "postgres://admin:ppp_password@localhost/main",
  "admin_secret": "ppp_admin_token_do_not_use"
}
'@

Write-Host "团队目录：$TeamDir"
$count = 0

Get-ChildItem -Path $TeamDir -Directory -Filter "workspace-*" | ForEach-Object {
    $wsName = $_.Name
    $potDir = Join-Path $_.FullName ".ppp-secret"
    New-Item -ItemType Directory -Force -Path $potDir | Out-Null
    $target = Join-Path $potDir "credentials.json"
    Set-Content -Path $target -Value $HoneypotContent -Encoding UTF8
    Write-Host "  ✅ $wsName\.ppp-secret\credentials.json"
    $count++
}

# 重置监控基线（让 pot_monitor.py 下次重建 atime 基线）
$StateFile = Join-Path $PSScriptRoot ".pot_state.json"
if (Test-Path $StateFile) {
    Remove-Item $StateFile
    Write-Host "🔄 已重置监控基线"
}

Write-Host "✅ 共重置 $count 个蜜罐文件"
