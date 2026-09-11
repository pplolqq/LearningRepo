#!/usr/bin/env python
"""本地启动脚本：python run.py [--port 8000] [--no-reload]"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

import uvicorn  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="启动 noteTipTap 后端")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-reload", action="store_true", help="关闭热重载")
    args = parser.parse_args()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        reload_dirs=[str(BACKEND_DIR / "app")],
    )


if __name__ == "__main__":
    main()
