package com.zrj.cloud.entities;

import java.io.Serializable;

/**
 * 支付实体
 * 学习用：不连数据库，数据由服务端直接构造 / 用内存 Map 模拟
 */
public class Payment implements Serializable {

    private Long id;
    private String serial; // 支付流水号

    public Payment() {
    }

    public Payment(Long id, String serial) {
        this.id = id;
        this.serial = serial;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSerial() {
        return serial;
    }

    public void setSerial(String serial) {
        this.serial = serial;
    }

    @Override
    public String toString() {
        return "Payment{id=" + id + ", serial='" + serial + "'}";
    }
}
