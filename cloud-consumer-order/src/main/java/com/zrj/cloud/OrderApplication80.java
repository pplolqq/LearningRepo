package com.zrj.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * 订单服务消费者 —— 启动端口 80
 *
 * 第 1 步（Nacos 注册中心）：注册到 Nacos，通过 DiscoveryClient 手动发现并调用支付服务
 * 第 2 步（Ribbon）：        @LoadBalanced RestTemplate 按服务名调用，自动负载均衡
 * 第 3 步（Feign）【当前状态】：@EnableFeignClients 启用声明式服务调用
 * 第 4 步（Hystrix）：     追加 @EnableHystrix 注解启用熔断
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableFeignClients
// @EnableHystrix        // ← 第 4 步：取消注释
public class OrderApplication80 {

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication80.class, args);
    }
}
