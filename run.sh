#!/usr/bin/env bash
# 启动本地服务网关（bash / WSL / macOS，需要该环境里有 node）
set -e
cd "$(dirname "$0")"

export GATEWAY_PORT="${GATEWAY_PORT:-5207}"
export NOTE_PORT="${NOTE_PORT:-5202}"
export SEEKFILE_PORT="${SEEKFILE_PORT:-9993}"

echo "网关地址: http://127.0.0.1:${GATEWAY_PORT}/"
ps -ef | grep "run_gateway_server.js" | grep -v grep | awk '{print $2}' | xargs -r kill
nohup node run_gateway_server.js  > /tmp/local_gateway.log 2>&1 &
ps -ef | grep "run_gateway_server.js" | grep -v grep | awk '{print $2}'


