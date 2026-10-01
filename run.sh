#!/usr/bin/env bash
# 启动本地服务网关（bash / WSL / macOS，需要该环境里有 node）
set -e
cd "$(dirname "$0")"

export GATEWAY_PORT="${GATEWAY_PORT:-5200}"
# export NOTE_PORT="${NOTE_PORT:-5202}"
# export SEEKFILE_PORT="${SEEKFILE_PORT:-9993}"

echo "网关地址: http://127.0.0.1:${GATEWAY_PORT}/"
# ps -ef | grep "run_gateway_server.js" | grep -v grep | awk '{print $2}' | xargs -r kill

powershell -NoProfile -Command "
  Start-Process powershell -ArgumentList '-NoProfile','-Command','node run_gateway_server.js' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id
"
bash run_wsl.sh
# ps -ef | grep "run_gateway_server.js" | grep -v grep | awk '{print $2}'

# taskkill /f /pid 29384
