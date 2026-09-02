package com.zrj.cloud.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 全局过滤器示例（第 5 步 Gateway）
 *
 * 作用：对经过网关的【每一个】请求都生效，这里打印访问日志 + 计时，
 * 用于直观观察"统一入口"如何拦截请求、并按路由转发到下游服务。
 *
 * 过滤器链概念：
 *   - GlobalFilter：所有路由都生效的过滤器（本类）
 *   - GatewayFilter：可配置在单个路由上的过滤器（如 AddRequestHeader）
 *   - getOrder() 返回值越小越先执行
 */
@Component
public class LogGlobalFilter implements GlobalFilter, Ordered {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("HH:mm:ss.SSS");

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String query = request.getQueryParams().isEmpty() ? "" : "?" + request.getURI().getRawQuery();
        long start = System.currentTimeMillis();

        System.out.println("[网关] " + LocalDateTime.now().format(FMT)
                + " 收到请求: " + request.getMethodValue() + " " + request.getPath() + query);

        // chain.filter(exchange)：继续走过滤器链 / 转发到下游；then(...) 在转发完成后执行
        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            System.out.println("[网关] " + LocalDateTime.now().format(FMT)
                    + " 转发完成, 耗时 " + (System.currentTimeMillis() - start)
                    + "ms, 响应状态: " + exchange.getResponse().getStatusCode());
        }));
    }

    /** 数值越小优先级越高：-100 保证最先执行（最早打印"收到请求"） */
    @Override
    public int getOrder() {
        return -100;
    }
}
