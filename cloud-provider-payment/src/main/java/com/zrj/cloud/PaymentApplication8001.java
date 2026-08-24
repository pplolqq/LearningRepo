package com.zrj.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * 支付服务提供者 —— 启动端口 8001
 *
 * 第 1 步（Nacos 注册中心）：
 *   - @EnableDiscoveryClient 表示开启服务发现客户端能力
 *   - 启动后会自动把自己注册到 Nacos（服务名 = application.yml 里的 cloud-provider-payment）
 *
 * 第 2 步（Ribbon）：
 *   - 再复制一个实例（如修改端口为 8002 启动第二个），配合订单服务的 Ribbon 演示负载均衡
 */
@SpringBootApplication
@EnableDiscoveryClient
public class PaymentApplication8001 {

    public static void main(String[] args) {
        SpringApplication.run(PaymentApplication8001.class, args);
    }
}
