ROOT="$(cd "$(dirname "$0")" && pwd)"
cd $ROOT
export SEEKFILE_PORT=${SEEKFILE_PORT:-9993}
# ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}' | xargs -r kill 
# ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}'
PID=$(powershell -Command '$p = Start-Process python -ArgumentList "./run_seek_file.py" -WindowStyle Hidden -PassThru; $p.Id')
# echo "started pid: $PID"
# kill -9 -W 1532 1523 1544 1505 1514
# ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}' 

# netstat -ano | grep LISTENING 
# netstat -ano | grep LISTENING | grep 9998
# ps -ef | grep server.py | grep -v grep

# ps -ef | grep "test" | grep -v grep | awk '{print $2}' 
# ps -ef | grep py
# taskkill //PID 28200 //F //T
# taskkill //PID 12980 //F //T
