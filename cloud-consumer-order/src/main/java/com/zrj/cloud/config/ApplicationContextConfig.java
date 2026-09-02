package com.zrj.cloud.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * 通用 Bean 配置
 */
@Configuration
public class ApplicationContextConfig {

    /**
     * 第 2 步（Ribbon，当前状态）：
     * @LoadBalanced 让 RestTemplate 拥有 Ribbon 客户端负载均衡能力，
     * 之后直接用服务名 "cloud-provider-payment" 代替 "ip:port" 调用，
     * 由 Ribbon 自动选择实例（默认轮询）。
     */
    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
