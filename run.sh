ROOT="$(cd "$(dirname "$0")" && pwd)"
cd $ROOT
export SEEKFILE_PORT=${SEEKFILE_PORT:-9999}
ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}' | xargs -r kill 
nohup python "./run_seek_file.py"  > /tmp/seek_file.log 2>&1 &
ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}'

# kill -9 -W 1532 1523 1544 1505 1514
ps -ef | grep "run_seek_file.py" | grep -v grep | awk '{print $2}' 

netstat -ano | grep LISTENING 
netstat -ano | grep LISTENING | grep 9998
# ps -ef | grep server.py | grep -v grep


ps -ef | grep "test" | grep -v grep | awk '{print $2}' 
ps -ef | grep py
