export NOTE_PORT="5202"
export SEEKFILE_PORT="9993"
export PI_PORT_WSL="5210"
export DSH_PORT_WSL="5211"
export PI_PORT="5212"
export DSH_PORT="5213"


start_noteTp(){
#  noteTp
wsl -e bash -lc "
    cd \$HOME/projects/agents/noteTipTap
    source \$HOME/.config/.bash_func
    kkk_load_login_env
    ./start_noteTp.sh stop
    export VITE_PORT=$NOTE_PORT
    export VITE_BACKEND_PORT="10101"
    ./start_noteTp.sh 
"
}

start_seek_file(){
    cd "$HOME/Desktop/Agent/seekFile"
    bash run.sh
}

# 用法: bash run_wsl.sh [note|seekfile|all]
# 不带参数 = all，保持原来的行为；带参数则只启动指定的那一个
case "${1:-all}" in
    note)     start_noteTp ;;
    seekfile) start_seek_file ;;
    all)      start_noteTp; start_seek_file ;;
    *)
        echo "未知的服务: $1" >&2
        echo "用法: bash run_wsl.sh [note|seekfile|all]" >&2
        exit 2
        ;;
esac
