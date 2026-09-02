#!/usr/bin/env bash
# ============================================================
# 第 4 步 Hystrix 熔断演示脚本（本地直接跑）
# 前置条件：
#   1. deploy 已启动（Nacos + provider x2 + consumer）
#   2. 已用 ./update-s.sh 部署最新代码
# 用法：./test-hystrix.sh
# ============================================================
set -e

BASE=http://localhost:9001   # 订单服务（宿主机 9001 → 容器 80）
P1=http://localhost:8001     # 支付服务实例1
P2=http://localhost:8002     # 支付服务实例2

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ✔ ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ ⚠ ]${NC} $*"; }
step()  { echo -e "\n${BOLD}${BLUE}================ $* ================${NC}"; }

# 调用并打印：返回内容 + 耗时
call() { # $1=url  $2=说明
  local url="$1" desc="$2"
  printf "${YELLOW}%s${NC}\n" "$desc"
  curl -s -w "\n     └─ 耗时: %{time_total}s\n" "$url" | sed 's/^/     /'
}

echo -e "${BOLD}${BLUE}========== 第 4 步 Hystrix 熔断演示开始 ==========${NC}"

# ---------- 阶段 1：正常调用 ----------
step "阶段1：正常调用（无故障，无降级）"
call "$BASE/consumer/payment/get/1" "GET /consumer/payment/get/1"

# ---------- 阶段 2：单次超时降级 ----------
step "阶段2：慢接口超时 → 触发降级"
info "支付服务 /payment/timeout 会 sleep 3s，Hystrix 超时阈值 2s → 2s 后走 fallback"
call "$BASE/consumer/payment/timeout" "GET /consumer/payment/timeout（超时降级）"

# ---------- 阶段 3：连续调用触发熔断 ----------
step "阶段3：连续 8 次快速调用 → 触发熔断"
info "熔断阈值：10s 窗口内 ≥5 个请求且错误率 ≥50%"
for i in $(seq 1 8); do
  out=$(curl -s -w "|%{time_total}" "$BASE/consumer/payment/timeout")
  body="${out%|*}"; t="${out##*|}"
  msg=$(echo "$body" | python3 -c "import json,sys; print(json.load(sys.stdin)['message'][:24])" 2>/dev/null || echo "?")
  printf "     第 %d 次: 耗时 %.2fs  → %s\n" "$i" "$t" "$msg"
done
warn "注意耗时变化：前面几次 ~2s（超时降级），熔断打开后立刻返回（快速失败，不再进支付服务）"

# ---------- 阶段 4：熔断隔离性 ----------
step "阶段4：熔断是按方法隔离的 —— 熔断期间普通接口不受影响"
call "$BASE/consumer/payment/get/1" "GET /consumer/payment/get/1（应仍正常）"

# ---------- 阶段 5：恢复 ----------
step "阶段5：让支付服务恢复正常（延迟清零）"
info "POST $P1/payment/recover + $P2/payment/recover"
curl -s -X POST "$P1/payment/recover" >/dev/null && echo "     ✅ 8001 已恢复"
curl -s -X POST "$P2/payment/recover" >/dev/null && echo "     ✅ 8002 已恢复"
info "等待 ${YELLOW}10s${NC}（sleepWindowInMilliseconds）进入半开状态..."
sleep 10

# ---------- 阶段 6：半开 → 恢复正常 ----------
step "阶段6：半开状态放一个测试请求 → 成功 → 熔断关闭"
call "$BASE/consumer/payment/timeout" "GET /consumer/payment/timeout（服务已恢复 → 应成功）"
call "$BASE/consumer/payment/get/1" "GET /consumer/payment/get/1（一切正常）"

echo -e "\n${BOLD}${BLUE}========== 演示结束 ==========${NC}"
echo "想看底层日志：docker logs -f cloud-consumer-order"
echo "想看支付服务慢调用日志：docker logs -f cloud-provider-payment"
echo "恢复慢状态（可选）：curl -X POST $P1/payment/fail && curl -X POST $P2/payment/fail"
