#!/usr/bin/env bash
set -e

# ============================ 颜色定义 ============================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 日志函数
log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[ ✔ ]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[ ⚠ ]${NC} $*"; }
log_error()   { echo -e "${RED}[ ✘ ]${NC} $*"; }
log_step()    { echo -e "\n${BOLD}${BLUE}================ $* ==================${NC}"; }
# ==================================================================

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$BASE_DIR/deploy"
SERVICES=(
  "cloud-provider-payment:provider"
  "cloud-provider-payment:provider2"
  "cloud-consumer-order:consumer"
  "cloud-gateway:gateway:step5"   # 第 5 步网关：带 compose profile (step5)
)
MVN="mvn"

# 公共模块
API_MODULE="cloud-api"
API_INSTALLED=0

# 解析参数
DEBUG=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --debug) DEBUG=1 ;;
    *)       ARGS+=("$arg") ;;
  esac
done

# 检测 cloud-api 是否有改动
api_has_changes() {
  if ! git -C "$BASE_DIR" diff --quiet HEAD -- "$API_MODULE" 2>/dev/null; then
    return 0
  fi
  if [ -n "$(git -C "$BASE_DIR" ls-files --others --exclude-standard -- "$API_MODULE" 2>/dev/null)" ]; then
    return 0
  fi
  return 1
}

mvn_package(){
  local module=$1
  if [ "$DEBUG" -eq 1 ]; then
    ( cd "$BASE_DIR" && $MVN install -f "$module/pom.xml" -DskipTests )
  else
    ( cd "$BASE_DIR" && $MVN install -f "$module/pom.xml" -DskipTests -q )
  fi
}


update_api() {
  log_step "公共模块 $API_MODULE 有改动，mvn install"
  mvn_package $API_MODULE  
  log_success "$API_MODULE 安装完成"
  API_INSTALLED=1
}

copy_jar() {
  local svc="$1"
  local src="$BASE_DIR/$svc/target/$svc-1.0-SNAPSHOT.jar"
  local dst="$DEPLOY_DIR/jars/$svc-1.0-SNAPSHOT.jar"
  if [ -f "$src" ]; then
    # 原地复制（保持同一 inode）：容器用 docker compose start/up 启动时不重建，
    # 只有 inode 不变，bind mount 才能看到新内容。
    # ⚠ 安全性：调用方保证同模块所有实例先停止且只复制一次（见 update_service），
    #   因此复制时不存在运行中的 JVM 在懒加载类，不会读到半截 jar。
    cp -f "$src" "$dst"
    log_success "已复制: $(basename "$src")"
  else
    log_error "未找到 $src，请先打包 $svc"
    return 1
  fi
}

update_service() {
  local module="$1"
  local compose_svc="$2"
  local profile="${3:-}"
  local pf=()
  [ -n "$profile" ] && pf=(--profile "$profile")  # 带 profile 的服务（如 gateway:step5）需要此参数才能被 compose 识别

  log_step "更新 $module (docker: $compose_svc)"

  if [ "$API_INSTALLED" -eq 0 ] && api_has_changes; then
    update_api
  fi

  # 1. 停止
  log_info "停止容器 $compose_svc ..."
  ( cd "$DEPLOY_DIR" && docker compose "${pf[@]}" stop "$compose_svc" )
  log_success "已停止 $compose_svc"

  # 2. 打包 + 复制（同模块多实例只打一次包、只复制一次）
  #    ⚠ 不能每次实例都复制：cp -f 会原地截断重写 jar，若此时另一个实例
  #      正在运行且 JVM 还在懒加载类，会读到半截 jar 导致 NoClassDefFoundError 崩溃
  if [ -z "${BUILT_MODULES[$module]:-}" ]; then
    log_info "打包 $module ..."
    mvn_package $module || { log_error "打包失败，中止 $compose_svc"; return 1; }
    log_success "打包完成 $module"
    copy_jar "$module" || { log_error "复制失败，中止 $compose_svc"; return 1; }
    BUILT_MODULES[$module]=1
  else
    log_info "$module 已打包并复制过，复用 jar（不再触碰 jar 文件）"
  fi

  # 3. 启动：up -d（不带 --force-recreate）
  #    已存在的容器不重建（等同 start，bind mount 保持原 inode，配合原地 cp 生效）；
  #    不存在的容器（如首次部署 gateway）会自动创建。
  log_info "启动容器 $compose_svc ..."
  ( cd "$DEPLOY_DIR" && docker compose "${pf[@]}" up -d --no-deps "$compose_svc" )
  log_success "已启动 $compose_svc"

  log_success "$compose_svc 更新完成"
}

declare -A BUILT_MODULES

main() {
  if [ "${#ARGS[@]}" -gt 0 ]; then
    for arg in "${ARGS[@]}"; do
      matched=0
      for entry in "${SERVICES[@]}"; do
        IFS=':' read -r module compose_svc profile <<< "$entry"
        if [ "$compose_svc" = "$arg" ] || [ "$module" = "$arg" ]; then
          update_service "$module" "$compose_svc" "$profile"
          matched=1
        fi
      done
      [ "$matched" -eq 0 ] && log_warn "未知服务 '$arg'，跳过"
    done
  else
    if api_has_changes; then
      update_api
    fi
    for entry in "${SERVICES[@]}"; do
      IFS=':' read -r module compose_svc profile <<< "$entry"
      update_service "$module" "$compose_svc" "$profile"
    done
  fi

  log_step "全部完成"
  ( cd "$DEPLOY_DIR" && docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' \
  | sed 's/0\.0\.0\.0://g; s/\[::\]://g; s/->/\//g' )
}

main