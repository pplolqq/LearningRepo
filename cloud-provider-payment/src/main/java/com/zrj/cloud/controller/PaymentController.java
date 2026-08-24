package com.zrj.cloud.controller;

import com.zrj.cloud.entities.CommonResult;
import com.zrj.cloud.entities.Payment;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * 支付服务接口（学习用：内存 Map 模拟数据库，不连真实数据库）
 */
@RestController
public class PaymentController {

    /** 当前服务端口：用于观察负载均衡时"到底哪个实例被调用"（第 2 步重点观察） */
    @Value("${server.port}")
    private String serverPort;

    /** 模拟数据库表 */
    private static final Map<Long, Payment> PAYMENT_DB = new HashMap<>();

    static {
        PAYMENT_DB.put(1L, new Payment(1L, "支付流水号-001"));
        PAYMENT_DB.put(2L, new Payment(2L, "支付流水号-002"));
    }

    /**
     * 按 id 查询支付信息
     * http://localhost:8001/payment/get/1
     */
    @GetMapping("/payment/get/{id}")
    public CommonResult<Payment> getPaymentById(@PathVariable("id") Long id) {
        Payment payment = PAYMENT_DB.get(id);
        if (payment != null) {
            System.out.println("【支付服务】端口 " + serverPort + " 被调用，查询 id=" + id);
            return CommonResult.success("查询成功，来自端口 " + serverPort, payment);
        }
        return CommonResult.error("未找到 id=" + id + " 的支付记录，来自端口 " + serverPort);
    }

    /**
     * 创建支付记录（模拟）
     */
    @PostMapping("/payment/create")
    public CommonResult<Payment> createPayment(@RequestBody Payment payment) {
        PAYMENT_DB.put(payment.getId(), payment);
        System.out.println("【支付服务】端口 " + serverPort + " 创建支付记录：" + payment);
        return CommonResult.success("创建成功，来自端口 " + serverPort, payment);
    }
}
