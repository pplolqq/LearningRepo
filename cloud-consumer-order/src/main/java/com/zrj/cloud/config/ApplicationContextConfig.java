package com.zrj.cloud.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * 通用 Bean 配置
 */
@Configuration
public class ApplicationContextConfig {

    /**
     * 第 1 步：普通 RestTemplate，手动拼 URL 调用（配合 DiscoveryClient 演示服务发现）
     *
     * 第 2 步（Ribbon）：把下面这行注释解开，@LoadBalanced 会让 RestTemplate
     * 拥有 Ribbon 客户端负载均衡能力 —— 之后直接用服务名
     * "cloud-provider-payment" 代替 "ip:port" 调用即可，由 Ribbon 自动选择实例。
     */
    @Bean
    // @LoadBalanced   // ← 第 2 步：取消注释
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
