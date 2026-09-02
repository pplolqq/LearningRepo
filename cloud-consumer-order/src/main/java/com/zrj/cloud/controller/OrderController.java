package com.zrj.cloud.controller;

import com.zrj.cloud.entities.CommonResult;
import com.zrj.cloud.entities.Payment;
import com.zrj.cloud.service.PaymentFeignService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 订单服务接口（消费者）：调用支付服务
 *
 * 第 3 步（Feign）【当前状态】：
 *   注入 PaymentFeignService 接口，像调用本地方法一样调用远程支付服务。
 *   Feign 内部自动完成 服务发现（Nacos）+ 负载均衡（Ribbon）+ HTTP 调用。
 *   相比第 2 步的 RestTemplate，不再手写 URL 字符串，方法签名有编译期检查。
 */
@RestController
public class OrderController {

    @Autowired
    private PaymentFeignService paymentFeignService;

    /**
     * 查询支付信息（Feign 版）
     * 访问 http://localhost/consumer/payment/get/1
     */
    @GetMapping("/consumer/payment/get/{id}")
    public CommonResult<Payment> getPayment(@PathVariable("id") Long id) {
        // 一个方法调用 = 一次远程 HTTP 请求（GET /payment/get/{id}）
        return paymentFeignService.getPaymentById(id);
    }

    /**
     * 创建支付记录（Feign 版，POST 示例）
     */
    @PostMapping("/consumer/payment/create")
    public CommonResult<Payment> createPayment(@RequestBody Payment payment) {
        // 一个方法调用 = 一次远程 HTTP 请求（POST /payment/create）
        return paymentFeignService.createPayment(payment);
    }
}
