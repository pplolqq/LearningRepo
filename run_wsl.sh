export NOTE_PORT="5202"
export SEEKFILE_PORT="9993"

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

start_file(){
    code "$HOME/Desktop/Agent/seekFile"
}

start_seek_file(){
    cd "$HOME/Desktop/Agent/seekFile"
    bash run.sh
}
start_noteTp
start_seek_file

