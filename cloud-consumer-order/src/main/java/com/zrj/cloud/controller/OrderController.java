package com.zrj.cloud.controller;

import com.zrj.cloud.entities.CommonResult;
import com.zrj.cloud.entities.Payment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * 订单服务接口（消费者）：调用支付服务
 *
 * 第 1 步（Nacos 注册中心）【当前状态】：
 *   通过 DiscoveryClient 从注册中心拿到 cloud-provider-payment 的实例列表，
 *   手动取第一个实例拼 URL 调用 —— 直观看到"服务发现"做了什么。
 *
 * 第 2 步（Ribbon）：
 *   这段"手动发现"代码全部删除，改成
 *     restTemplate.getForObject("http://cloud-provider-payment/payment/get/" + id, CommonResult.class)
 *   由 Ribbon 自动完成 发现 + 选择实例 + 负载均衡。
 */
@RestController
public class OrderController {

    /** 要调用的服务名（注册在 Nacos 里的名字） */
    public static final String PAYMENT_SERVICE = "cloud-provider-payment";

    @Autowired
    private DiscoveryClient discoveryClient;   // 第 1 步：服务发现客户端

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 第 1 步：查询支付信息（手动服务发现版）
     * 访问 http://localhost/consumer/payment/get/1
     */
    @GetMapping("/consumer/payment/get/{id}")
    public CommonResult<Payment> getPayment(@PathVariable("id") Long id) {
        // 1. 从注册中心获取支付服务的所有实例
        List<ServiceInstance> instances = discoveryClient.getInstances(PAYMENT_SERVICE);
        if (instances == null || instances.isEmpty()) {
            return CommonResult.error("没有发现服务：" + PAYMENT_SERVICE + "，请确认支付服务已启动并注册到 Nacos");
        }

        // 2. 手动取第一个实例，拼出 URL（第 2 步改成 Ribbon 后这段就不需要了）
        ServiceInstance instance = instances.get(0);
        String url = "http://" + instance.getHost() + ":" + instance.getPort() + "/payment/get/" + id;

        System.out.println("【订单服务】发现 " + PAYMENT_SERVICE + " 实例 " + instances.size()
                + " 个，本次调用：" + url);

        // 3. 用 RestTemplate 发起调用
        return restTemplate.getForObject(url, CommonResult.class);
    }

    /**
     * 第 1 步：创建支付记录（手动服务发现版，POST 示例）
     */
    @PostMapping("/consumer/payment/create")
    public CommonResult<Payment> createPayment(@RequestBody Payment payment) {
        List<ServiceInstance> instances = discoveryClient.getInstances(PAYMENT_SERVICE);
        if (instances == null || instances.isEmpty()) {
            return CommonResult.error("没有发现服务：" + PAYMENT_SERVICE + "，请确认支付服务已启动并注册到 Nacos");
        }

        ServiceInstance instance = instances.get(0);
        String url = "http://" + instance.getHost() + ":" + instance.getPort() + "/payment/create";

        System.out.println("【订单服务】发现 " + PAYMENT_SERVICE + " 实例 " + instances.size()
                + " 个，本次调用：" + url);

        return restTemplate.postForObject(url, payment, CommonResult.class);
    }
}
