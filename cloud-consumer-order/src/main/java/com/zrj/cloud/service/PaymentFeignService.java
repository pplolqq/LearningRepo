package com.zrj.cloud.service;

import com.zrj.cloud.entities.CommonResult;
import com.zrj.cloud.entities.Payment;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * 支付服务 Feign 客户端（第 3 步）
 *
 * 声明式服务调用：接口方法签名 = 远程 HTTP 请求，
 * Feign 在启动时按注解动态生成实现类（代理对象），
 * 调用方法就像调用本地方法一样，底层自动完成：
 *   服务发现（Nacos）→ 负载均衡（Ribbon）→ HTTP 请求（默认 HttpClient）
 *
 * 用法对比：
 *   第 2 步 RestTemplate：手动写 URL 字符串，容易写错、无编译期检查
 *   第 3 步 Feign：      接口 + 注解，IDE 能补全、编译期就能发现路径写错
 */
@FeignClient(name = "cloud-provider-payment")  // name = 注册在 Nacos 里的服务名
public interface PaymentFeignService {

    /** 对应支付服务的 GET /payment/get/{id} */
    @GetMapping("/payment/get/{id}")
    CommonResult<Payment> getPaymentById(@PathVariable("id") Long id);

    /** 对应支付服务的 POST /payment/create */
    @PostMapping("/payment/create")
    CommonResult<Payment> createPayment(@RequestBody Payment payment);
}
