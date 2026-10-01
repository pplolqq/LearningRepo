export PI_PORT_WSL="5210"
export DSH_PORT_WSL="5211"
export PI_PORT="5212"
export DSH_PORT="5213"
start_Agents(){
  powershell -NoProfile -Command "
  Start-Process powershell -ArgumentList '-NoProfile','-Command','pi-web-ui.ps1 --port $PI_PORT --no-browser' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id
"
    # powershell -Command "Start-Process -FilePath pi-web-ui -ArgumentList '--port $PI_PORT','--no-browser' -WindowStyle Hidden"
    # powershell -Command "Start-Process dsh web -ArgumentList '--port $DSH_PORT' '--no-open' -WindowStyle Hidden"
    # nohup dsh web --no-open --port $DSH_PORT > /tmp/dsh.log 2>&1 &
#     wsl -e bash -lc "
#     source \$HOME/.config/.bash_func
#     kkk_load_login_env
#     tmux new-session -d -s pi 'pi-web-ui --port ${PI_PORT_WSL}' 
#     tmux new-session -d -s dsh 'dsh web --port ${DSH_PORT_WSL} --no-open'
# "
}

getpid() {
  local port=$1 mode=${2:-auto} pid=""
  if [ "$mode" = wsl ] || [ "$mode" = auto ]; then
pid=$(wsl bash <<WRAPPED
lsof -i -P -n 2>/dev/null | awk -v p=:$port '\$9~p && /LISTEN/{print \$2; exit}'
WRAPPED
)
  fi
  if [ -z "$pid" ] && { [ "$mode" = win ] || [ "$mode" = auto ]; }; then
    pid=$(netstat -aon | grep -a LISTEN | awk -v p=":$port " '$2~p{print $5; exit}')
  fi
  echo "$port -> ${pid:-not found}"
}
start_Agents
# getpid 5200 wsl
# ps -ef | grep -vi vscode | grep -v "grep" | awk '{print $2}' | while read pid; do
#   port=$(netstat -aon | grep -a LISTEN  | awk '{print $5}' | grep "$pid" | head -n 1)
#   if [ -n "$port" ]; then
#     echo "PID:$pid | Port:$port "
#   fi
# done

