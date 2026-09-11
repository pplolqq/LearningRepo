#!/usr/bin/env bash
#
# 单向目录同步脚本（基于 rsync）
#
#   把 <源目录> 的内容同步到 <目标目录>，支持任意多个排除项。
#   默认是「镜像」模式：目标端比源端多出来的文件/目录会被删除。
#
# 用法:
#   ./sync-dirs.sh [选项] <源目录> <目标目录>
#
# 选项:
#   -e, --exclude <模式>   排除项，可重复使用（rsync 规则，匹配任意层级）
#                          -e node_modules   排除所有叫 node_modules 的目录/文件
#                          -e 'node_modules/' 只排除同名目录
#                          -e '*.log'        排除所有 .log 文件
#   -n, --dry-run          只预览，不做任何改动
#   -D, --no-delete        只增改，不删除目标端多余的文件（非镜像）
#   -a, --archive          使用 rsync -a 完整归档（保留 权限/属主/属组）
#                          默认不加，因为同步到 /mnt/c (NTFS) 时权限相关操作无意义且可能报错
#   -h, --help             显示帮助
#
# 示例:
#   # 先预览，确认没问题再去掉 -n
#   ./sync-dirs.sh -n -e node_modules -e dist \
#       /home/pplolqq/projects/agents/noteTipTap/frontend \
#       /mnt/c/Users/zrj21/Desktop/Agent/noteTp/frontend
#
# 说明:
#   - 源目录必须存在；目标目录不存在会自动创建
#   - 两个路径的结尾有没有 / 都行，脚本按「同步目录内容」处理
#   - 被 -e 排除的东西，目标端即使存在也不会被删除（不加 --delete-excluded）
#   - 符号链接默认跳过（不复制）；空目录正常同步
#
set -Eeuo pipefail

usage() {
  # 打印文件头部的注释块（第 1 行 shebang 之后连续的 # 行）
  awk 'NR > 1 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "$0"
}

die() { printf '\033[31m[错误]\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m[同步]\033[0m %s\n' "$*"; }

# ---------------- 参数解析 ----------------
EXCLUDES=()
DELETE=1
DRY=0
ARCHIVE=0
POS=()

while (($#)); do
  case "$1" in
    -e|--exclude)
      [[ -n "${2:-}" ]] || die "$1 后面要跟一个排除模式"
      EXCLUDES+=("$2"); shift 2 ;;
    --exclude=*) EXCLUDES+=("${1#*=}"); shift ;;
    -n|--dry-run) DRY=1; shift ;;
    -D|--no-delete) DELETE=0; shift ;;
    -d|--delete) DELETE=1; shift ;;
    -a|--archive) ARCHIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while (($#)); do POS+=("$1"); shift; done ;;
    -*) die "未知选项: $1（用 -h 看用法）" ;;
    *) POS+=("$1"); shift ;;
  esac
done

((${#POS[@]} == 2)) || { usage; echo; die "需要两个参数：<源目录> <目标目录>（你给了 ${#POS[@]} 个）"; }

command -v rsync >/dev/null 2>&1 || die "没找到 rsync，请先安装：sudo apt install -y rsync"

SRC="$(realpath -m -- "${POS[0]}")"
DST="$(realpath -m -- "${POS[1]}")"

[[ -d "$SRC" ]] || die "源目录不存在: $SRC"
[[ "$SRC" != "$DST" ]] || die "源和目标不能是同一个目录: $SRC"

# 防止目标套在源里面（或反过来）造成递归 / 误删
case "$DST/" in "$SRC/"*) die "目标目录不能位于源目录内部: $DST ⊂ $SRC" ;; esac
case "$SRC/" in "$DST/"*) die "源目录不能位于目标目录内部: $SRC ⊂ $DST" ;; esac

mkdir -p -- "$DST"

# ---------------- 组装 rsync 参数 ----------------
if ((ARCHIVE)); then
  BASE=(-a)
else
  # 复制内容 + 保留修改时间；不管权限/属主（跨文件系统更稳）
  BASE=(-rlt --no-perms --no-owner --no-group --omit-dir-times --modify-window=2)
fi

ARGS=("${BASE[@]}" --human-readable --itemize-changes --stats)
((DELETE)) && ARGS+=(--delete)
((DRY)) && ARGS+=(-n)
for e in ${EXCLUDES[@]+"${EXCLUDES[@]}"}; do ARGS+=(--exclude="$e"); done

echo "======================================================"
info "源     : $SRC"
info "目标   : $DST"
info "模式   : $(((DELETE)) && echo '镜像（删除目标端多余文件）' || echo '只增改（不删除）')$(((DRY)) && echo '  [演练 dry-run，不会真的改动]' || echo '')"
info "排除   : ${EXCLUDES[*]:-（无）}"
echo "======================================================"

# ---------------- 执行 ----------------
rc=0
OUT="$(rsync "${ARGS[@]}" -- "$SRC/" "$DST/")" || rc=$?

if ((rc != 0 && rc != 24)); then
  printf '%s\n' "$OUT" | grep -vE '^(Number of|Total|Literal|Matched|File list|Total file|Sent |Total bytes)' || true
  die "rsync 失败（退出码 $rc）"
fi

# 只显示「真正发生变化」的行 + 两行统计
printf '%s\n' "$OUT" | grep -E '^([<>ch*.][^ ]*|.*deleting )' || echo "（两边已经完全一致，没有变化）"
printf '%s\n' "$OUT" | grep -E 'Number of regular files transferred|Total transferred file size' || true

echo "------------------------------------------------------"
if ((DRY)); then
  info "演练结束，未做任何改动（去掉 -n 才会真正同步）"
else
  info "同步完成: $SRC  ->  $DST"
fi
