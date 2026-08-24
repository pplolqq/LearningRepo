package com.zrj.cloud.entities;

import java.io.Serializable;

/**
 * 通用返回结果封装（统一各服务的响应格式）
 *
 * @param <T> 业务数据类型
 */
public class CommonResult<T> implements Serializable {

    private Integer code;    // 状态码：200 成功，500 失败
    private String message;  // 提示信息
    private T data;          // 业务数据

    public CommonResult() {
    }

    public CommonResult(Integer code, String message) {
        this(code, message, null);
    }

    public CommonResult(Integer code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static <T> CommonResult<T> success(T data) {
        return new CommonResult<>(200, "操作成功", data);
    }

    public static <T> CommonResult<T> success(String message, T data) {
        return new CommonResult<>(200, message, data);
    }

    public static <T> CommonResult<T> error(String message) {
        return new CommonResult<>(500, message, null);
    }

    public Integer getCode() {
        return code;
    }

    public void setCode(Integer code) {
        this.code = code;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }

    @Override
    public String toString() {
        return "CommonResult{code=" + code + ", message='" + message + "', data=" + data + "}";
    }
}
