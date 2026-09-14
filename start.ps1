# 启动本地服务网关（Windows / PowerShell）
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "未找到 node，请先安装 Node.js（>= 18）。" -ForegroundColor Red
    exit 1
}

# 端口与 run_wsl.sh 保持同一组变量名
if (-not $env:GATEWAY_PORT)   { $env:GATEWAY_PORT   = '5200' }
if (-not $env:NOTE_PORT)      { $env:NOTE_PORT      = '5202' }
if (-not $env:SEEKFILE_PORT)  { $env:SEEKFILE_PORT  = '9993' }

$url = "http://127.0.0.1:$($env:GATEWAY_PORT)/"
Write-Host "网关地址: $url" -ForegroundColor Cyan
Start-Process $url | Out-Null

node server.js
