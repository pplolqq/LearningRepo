#!/bin/bash
# cpf - 把文件复制到 Windows Temp 目录，再用 cpf.exe 写入剪贴板
# 用法: cpf <file> [file...]

set -e

# === 配置（按需修改）===
CFCLIP="/mnt/c/Users/zrj21/local_tools/cpf.exe"
TEMP_DIR="/mnt/c/Users/zrj21/AppData/Local/Temp"

# === 参数检查 ===
if [ $# -eq 0 ]; then
    echo "usage: cpf <file> [file...]" >&2
    exit 1
fi

WINPATHS=()
i=0

for SRC in "$@"; do
    i=$((i + 1))
    if [ ! -f "$SRC" ]; then
        echo "FILE NOT FOUND: $SRC" >&2
        exit 1
    fi
    # === 如果是 WSL 本地路径，先 cp 到 Windows Temp ===
    case "$SRC" in
        /mnt/?/*)
            # 已在 Windows 盘上，直接用
            WINPATH="$SRC"
            ;;
        *)
            # WSL 本地文件，cp 到 Temp（PID + 序号防重名）
            BASE="$(basename "$SRC")"
            DST="$TEMP_DIR/$$_${i}_$BASE"
            cp "$SRC" "$DST"
            WINPATH="$DST"
            echo "copied to: $DST"
            # 后台 30 秒后清理
            (sleep 30 && rm -f "$DST") &
            ;;
    esac

    # === 把路径转成 Windows 风格 C:\xxx ===
    WINPATHS+=("$(wslpath -w "$WINPATH")")
done

# === 调 cpf.exe 写入剪贴板（多个文件一起传）===
"$CFCLIP" "${WINPATHS[@]}"
