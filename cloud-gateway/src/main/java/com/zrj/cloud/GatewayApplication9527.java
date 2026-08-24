package com.zrj.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * API 网关 —— 启动端口 9527
 *
 * 第 5 步（Gateway）：启动本服务，所有请求从网关统一入口进入，
 * 由网关按路径断言 + lb://服务名 路由到具体的微服务。
 * 第 1~4 步不需要启动它。
 */
@SpringBootApplication
@EnableDiscoveryClient
public class GatewayApplication9527 {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication9527.class, args);
    }
}
