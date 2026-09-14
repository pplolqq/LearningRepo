#!/usr/bin/env bash
# 查看 pi-web-ui / dsh web 各端口进程的资源占用（内存 / CPU / 线程）
# 用法: bash check_agents.sh        # 在 Git Bash 下运行，同时查 Windows 和 WSL
# 端口可用环境变量覆盖，默认与 run_agens.sh 保持一致
set -u

PI_PORT="${PI_PORT:-5212}"           # Windows pi-web-ui
DSH_PORT="${DSH_PORT:-5213}"         # Windows dsh web
PI_PORT_WSL="${PI_PORT_WSL:-5210}"   # WSL     pi-web-ui
DSH_PORT_WSL="${DSH_PORT_WSL:-5211}" # WSL     dsh web

echo "===== Windows ====="
printf '%-6s %-12s %-8s %12s %9s %8s\n' PORT SERVICE PID MEM CPU THREADS
for spec in "$PI_PORT|pi-web-ui" "$DSH_PORT|dsh web"; do
  port=${spec%%|*}; name=${spec#*|}
  pid=$(netstat -ano -p TCP 2>/dev/null | awk -v p=":$port" '$4=="LISTENING" && $2 ~ (p "$") {print $5; exit}')
  if [ -z "$pid" ]; then
    printf '%-6s %-12s %-8s %12s\n' "$port" "$name" "-" "not running"
    continue
  fi
  # 输出: WorkingSet64 CPU Threads.Count
  info=$(powershell -NoProfile -Command "Get-Process -Id $pid -ErrorAction SilentlyContinue | ForEach-Object { '{0} {1} {2}' -f \$_.WorkingSet64, \$_.CPU, \$_.Threads.Count }" 2>/dev/null)
  read -r ws cpu thr <<<"${info:-0 0 0}"
  read -r mem cpu <<<"$(awk -v w="${ws:-0}" -v c="${cpu:-0}" 'BEGIN{printf "%.1f %.1f", w/1048576, c}')"
  printf '%-6s %-12s %-8s %10s MB %8ss %8s\n' \
    "$port" "$name" "$pid" "$mem" "$cpu" "${thr:-0}"
done

echo
echo "===== WSL ====="
wsl -e bash -c '
printf "%-6s %-12s %-8s %12s %9s %7s\n" PORT SERVICE PID MEM CPU MEM%
for spec in "$1" "$2"; do
  port=${spec%%|*}; name=${spec#*|}
  pid=$(ss -tlnpH "sport = :$port" 2>/dev/null | head -1 | sed -n "s/.*pid=\([0-9]*\).*/\1/p")
  if [ -z "$pid" ]; then
    printf "%-6s %-12s %-8s %12s\n" "$port" "$name" "-" "not running"
    continue
  fi
  ps -o rss=,%cpu=,%mem= -p "$pid" | awk -v p="$port" -v n="$name" -v d="$pid" \
    "{printf \"%-6s %-12s %-8s %9.1f MB %8s%% %6s%%\n\", p, n, d, \$1/1024, \$2, \$3}"
done
free -m | awk "NR==2{print \"\"; print \"WSL total/used/available (MB): \" \$2 \" / \" \$3 \" / \" \$7}"
' bash "$PI_PORT_WSL|pi-web-ui" "$DSH_PORT_WSL|dsh web" 2>&1 | grep -v 'screen size is bogus'
