#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

export VITE_PORT="${VITE_PORT:-5200}"
export VITE_BACKEND_PORT="${VITE_BACKEND_PORT:-8000}"

SESSION="noteTp"

# ── 停止 ──
stop() {
  local target="${1:-}"  # 没传参数就是空
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "⚠️  session '$SESSION' not found"
    return 0
  fi

  if [ -n "$target" ]; then
    if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$target"; then
      tmux kill-window -t "$SESSION:$target"
      echo "✅ window '$target' killed"
    else
      echo "⚠️  window '$target' not found"
    fi
  else
    tmux kill-session -t "$SESSION"
    echo "✅ session '$SESSION' killed"
  fi
}


# ── 核心函数 ──
add_window() {
  local name="$1"
  local dir="$2"
  local cmd="$3"

  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    # session 不存在 → 创建 session + 第一个 window
    tmux new-session -d -s "$SESSION" -n "$name" -c "$dir" bash -lc "$cmd"
    echo "  [$name] session + window created"
    return 0
  fi

  # session 存在 → 检查 window 是否已存在
  if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$name"; then
    echo "  [$name] window already exists, skip"
    return 0
  fi

  # 新增 window
  tmux new-window -t "$SESSION" -n "$name" -c "$dir" bash -lc "$cmd"
  echo "  [$name] window added"
}

# ── 启动 ──
start() {
  echo "🚀 Starting (VITE_PORT=$VITE_PORT, BACKEND_PORT=$VITE_BACKEND_PORT)..."

  add_window "backend" "$ROOT/backend" "
    [ -f ./.venv/bin/activate ] && source ./.venv/bin/activate
    ./run.py --port $VITE_BACKEND_PORT
  "

  add_window "frontend" "$ROOT/frontend" "
    export VITE_PORT=$VITE_PORT
    export VITE_BACKEND_PORT=$VITE_BACKEND_PORT
    pnpm install
    pnpm dev
  "

  echo ""
  echo "✅ tmux session '$SESSION' ready"
  tmux list-windows -t "$SESSION" -F '   #{window_index}: #{window_name} (#{pane_current_command})'
}

# ── 状态 ──
status() {
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "⚠️  session '$SESSION' not found"
    return 1
  fi

  echo "📋 session '$SESSION':"
  tmux list-windows -t "$SESSION" -F '   #{window_index}: #{window_name} (#{pane_current_command})'

  echo ""
  echo "🔌 Listening ports:"
  lsof -i -P -n 2>/dev/null | grep LISTEN 
}

# ── 重启 ──
restart() {
  local target="${1:-}"
  if [ -n "$target" ]; then
    echo "🔄 Restarting window '$target'..."
    stop "$target"
    sleep 0.5
    start
  else
    echo "🔄 Restarting entire session..."
    stop
    sleep 0.5
    start
  fi
}

# ── 入口 ──
case "${1:-start}" in
  start)   start ;;
  stop)    stop "${2:-}" ;;
  restart) restart "${2:-}" ;;
  status)  status ;;
  *)
    echo "Usage: $0 {start|stop [window]|restart [window]|status}"
    echo ""
    echo "Examples:"
    echo "  $0 start              # 启动全部"
    echo "  $0 stop               # 停掉整个 session"
    echo "  $0 stop backend       # 只停 backend window"
    echo "  $0 restart            # 重启全部"
    echo "  $0 restart frontend   # 只重启 frontend"
    echo "  $0 status             # 查看状态"
    exit 1
    ;;
esac