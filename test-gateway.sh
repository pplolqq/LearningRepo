#!/usr/bin/env bash
# ============================================================
# 第 5 步 Gateway 网关演示脚本（本地直接跑）
# 前置条件：
#   1. deploy 已启动（Nacos + provider x2 + consumer + gateway）
#   2. 已用 ./update-s.sh gateway 部署最新代码
# 用法：./test-gateway.sh
# ============================================================
set -e

GATEWAY=http://localhost:9527   # 网关统一入口
CONSUMER=http://localhost:9001  # 订单服务（直连）
P1=http://localhost:8001        # 支付服务实例1
P2=http://localhost:8002        # 支付服务实例2

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ✔ ]${NC} $*"; }
step()  { echo -e "\n${BOLD}${BLUE}================ $* ================${NC}"; }

echo -e "${BOLD}${BLUE}========== 第 5 步 Gateway 网关演示开始 ==========${NC}"

# ---------- 阶段1：统一入口 ----------
step "阶段1：统一入口 —— 所有请求从 9527 进，由网关按路径路由"
info "访问 http://localhost:9527/consumer/payment/get/1 → 路由到订单服务（再 Feign 调支付）"
curl -s -w "\n     └─ 耗时: %{time_total}s\n" "$GATEWAY/consumer/payment/get/1" | sed 's/^/     /'

# ---------- 阶段2：直接路由到支付服务 + 负载均衡 ----------
step "阶段2：/payment/** 直接路由到支付服务，lb:// 自动负载均衡"
info "连续 6 次走网关直连支付服务，观察 8001/8002 轮询："
for i in $(seq 1 6); do
  msg=$(curl -s "$GATEWAY/payment/get/1" | python3 -c "import json,sys; print(json.load(sys.stdin)['message'])" 2>/dev/null)
  printf "     第 %d 次 → %s\n" "$i" "$msg"
done

# ---------- 阶段3：对比 直连 vs 走网关 ----------
step "阶段3：对比 直连 vs 走网关（统一入口的价值）"
for u in "$CONSUMER/consumer/payment/get/1" "$GATEWAY/consumer/payment/get/1"; do
  t=$(curl -s -o /dev/null -w "%{time_total}" "$u")
  printf "     %-45s 耗时 %.3fs\n" "$u" "$t"
done
ok "两条路径结果相同，但走网关后：客户端只认一个地址(9527)，不用关心后端有几个服务、IP 是什么"

# ---------- 阶段4：路径断言 —— 不匹配的路由 404 ----------
step "阶段4：路径断言 —— 未配置的路由返回 404"
code=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/nonexistent/path")
printf "     GET /nonexistent/path → HTTP %s（网关层直接拒绝，不会转发）\n" "$code"

# ---------- 阶段5：全局过滤器日志 ----------
step "阶段5：全局过滤器 —— 看网关日志（每个请求都有记录）"
info "执行: docker logs cloud-gateway | grep '\[网关\]' | tail -5"
docker logs cloud-gateway 2>&1 | grep '\[网关\]' | tail -5 | sed 's/^/     /'

echo -e "\n${BOLD}${BLUE}========== 演示结束 ==========${NC}"
echo "想体验更完整的链路：curl $GATEWAY/consumer/payment/get/2  (9527→订单→支付)"
