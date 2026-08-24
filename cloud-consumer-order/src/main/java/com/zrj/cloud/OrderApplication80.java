package com.zrj.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * 订单服务消费者 —— 启动端口 80
 *
 * 第 1 步（Nacos 注册中心）：注册到 Nacos，通过 DiscoveryClient 手动发现并调用支付服务
 * 第 3 步（Feign）：     追加 @EnableFeignClients 注解启用 Feign 声明式调用
 * 第 4 步（Hystrix）：   追加 @EnableHystrix 注解启用熔断
 */
@SpringBootApplication
@EnableDiscoveryClient
// @EnableFeignClients   // ← 第 3 步：取消注释
// @EnableHystrix        // ← 第 4 步：取消注释
public class OrderApplication80 {

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication80.class, args);
    }
}
