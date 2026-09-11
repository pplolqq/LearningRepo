#!/usr/bin/env bash
# 一键准备后端环境（本机 python3.10 没有 python3-venv，所以做了 pip 引导兜底）
#   ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "==> 创建虚拟环境 .venv"
  python3 -m venv --without-pip .venv || python3 -m venv .venv
fi

if [ ! -x .venv/bin/pip ]; then
  echo "==> 当前 Python 缺少 ensurepip，改用 get-pip.py 引导 pip"
  curl -fsSL -o .get-pip.py https://bootstrap.pypa.io/get-pip.py
  # 注意：必须在本目录执行，避免 /tmp 下的同名模块污染 sys.path
  ./.venv/bin/python ./.get-pip.py -q
  rm -f .get-pip.py
fi

echo "==> 安装依赖"
./.venv/bin/pip install -q --upgrade pip
./.venv/bin/pip install -q -r requirements.txt

echo "==> 完成。启动：./.venv/bin/python run.py"
