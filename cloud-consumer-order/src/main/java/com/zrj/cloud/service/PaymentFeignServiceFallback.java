package com.zrj.cloud.service;

import com.zrj.cloud.entities.CommonResult;
import com.zrj.cloud.entities.Payment;
import org.springframework.stereotype.Component;

/**
 * PaymentFeignService 的降级实现（第 4 步 Hystrix）
 *
 * 什么时候会走到这里？
 *   1. 超时：  调用支付服务超过 Hystrix 超时阈值（默认 1s，本演示配 2s）
 *   2. 异常：  下游抛异常 / 连接失败
 *   3. 熔断：  熔断器打开期间，请求不再发往下游，直接走这里（快速失败）
 *
 * 作用：把"下游故障"消化在消费者内部，返回兜底数据，不让异常抛给前端。
 * 注意：必须实现接口的全部方法（每个方法一个降级）。
 */
@Component
public class PaymentFeignServiceFallback implements PaymentFeignService {

    @Override
    public CommonResult<Payment> getPaymentById(Long id) {
        return CommonResult.error("【降级】支付服务暂时不可用（getPaymentById），请稍后重试");
    }

    @Override
    public CommonResult<Payment> createPayment(Payment payment) {
        return CommonResult.error("【降级】支付服务暂时不可用（createPayment），请稍后重试");
    }

    @Override
    public CommonResult<Payment> timeout() {
        return CommonResult.error("【降级】支付服务响应超时或已熔断（timeout），请稍后重试");
    }
}
