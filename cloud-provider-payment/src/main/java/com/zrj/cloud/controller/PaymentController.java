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

    /** 慢调用延迟（毫秒）。第 4 步演示用：默认 3000ms，可通过 recover/fail 接口切换 */
    private static volatile long timeoutMillis = 3000L;

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

    /**
     * 模拟慢调用（第 4 步 Hystrix 演示）：sleep timeoutMillis 毫秒后正常返回
     * 默认 3000ms，超过 Hystrix 超时阈值(2s) → 触发超时降级/熔断
     * 通过 /payment/recover 把延迟清零可模拟"服务恢复"
     */
    @GetMapping("/payment/timeout")
    public CommonResult<Payment> timeout() {
        System.out.println("【支付服务】端口 " + serverPort + " 收到慢调用，sleep " + timeoutMillis + "ms");
        try {
            Thread.sleep(timeoutMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return CommonResult.success("慢调用完成（耗时 " + timeoutMillis + "ms），来自端口 " + serverPort,
                new Payment(999L, "慢调用模拟"));
    }

    /**
     * 模拟服务恢复正常（第 4 步演示）：把延迟清零，/payment/timeout 立刻返回
     */
    @PostMapping("/payment/recover")
    public CommonResult<String> recover() {
        timeoutMillis = 0L;
        System.out.println("【支付服务】端口 " + serverPort + " 已恢复（延迟清零）");
        return CommonResult.success("已恢复，延迟清零", "ok");
    }

    /**
     * 模拟服务变慢（第 4 步演示）：恢复 3000ms 延迟
     */
    @PostMapping("/payment/fail")
    public CommonResult<String> fail() {
        timeoutMillis = 3000L;
        System.out.println("【支付服务】端口 " + serverPort + " 已变慢（延迟 3000ms）");
        return CommonResult.success("已变慢，延迟 3000ms", "ok");
    }
}
