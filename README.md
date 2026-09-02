# springcloud-learn —— Spring Cloud 微服务入门学习项目

一个**由浅入深**的微服务学习 demo，五步已全部完成 ✅：
**Nacos 注册中心 → Ribbon 负载均衡 → Feign 服务调用 → Hystrix 熔断 → Gateway 网关**。

> 不使用数据库，业务全部用**内存 Map + 简单函数**模拟，聚焦"微服务基础设施"本身。

---

## 🏗 整体架构（五步成果总览）

```
                         ┌──────────────────────────────────────────────┐
                         │               Nacos 注册中心 (8848)           │
                         │   服务注册/发现 · 心跳健康检查 · 权重管理      │
                         └───────▲──────────▲──────────▲──────────▲──────┘
                                 │注册      │注册      │注册      │注册
                         ┌───────┴───┐ ┌────┴────┐ ┌────┴────┐ ┌──┴───────┐
                         │ 订单服务   │ │ 支付服务 │ │ 支付服务 │ │  网关    │
                         │ consumer  │ │ provider │ │ provider2│ │ gateway  │
                         │   :80     │ │  :8001  │ │  :8002  │ │  :9527   │
                         └─────┬─────┘ └────┬────┘ └────┬────┘ └──▲───────┘
                               │            └────┬───────┘        │
       客户端 ──► 网关(9527) ──┴─► 订单 ──(Feign+Ribbon+Hystrix)──► 支付(8001/8002)
       统一入口    路由/过滤     调用方       声明式调用/负载均衡/熔断    提供者
```

**一次完整请求的旅程**：`客户端 → 网关(9527) → 订单服务(80) → Feign → 支付服务(8001/8002)`

| 层 | 服务 | 端口 | 职责 | 对应步骤 |
|---|---|---|---|---|
| 入口层 | cloud-gateway | 9527 | 统一入口、路由断言、全局过滤器 | 第 5 步 |
| 调用方 | cloud-consumer-order | 80 | 业务编排，调用支付服务 | 第 2~4 步 |
| 提供方 | cloud-provider-payment | 8001 / 8002 | 提供数据接口（内存 Map 模拟） | 第 1 步 |
| 注册中心 | Nacos | 8848 | 服务注册与发现 | 第 1 步 |

---

## 一、为什么是这个技术栈（先看这段）

| 组件 | 版本 |
|---|---|
| JDK | **8 或 11**（必须，原因见下） |
| Spring Boot | 2.3.12.RELEASE |
| Spring Cloud | Hoxton.SR12 |
| Spring Cloud Alibaba | 2.2.7.RELEASE |
| Nacos Server | 2.x（2.2.x / 2.3.x 均可） |

**为什么不用 JDK 21 / Spring Boot 3？**
因为 Hystrix 和 Ribbon 在 Spring Cloud 2020.0（对应 Spring Boot 2.4）之后被官方移出维护，
**只有 Spring Boot 2.3.x + Spring Cloud Hoxton 这个组合能同时"原汁原味"体验
Nacos + Ribbon + Feign + Hystrix + Gateway 五件套**，这是国内微服务入门教程最经典的组合。
代价是它无法运行在 JDK 17+ 上，所以需要 JDK 8 或 11。

> 补充：Hystrix 已停止维护，生产环境推荐 Sentinel / Resilience4j，但 Hystrix 的
> 熔断、降级设计思想至今通用，作为入门学习完全值得。

---

## 二、环境准备清单

### 1. JDK 8 或 11（必需）
- 下载 [Temurin JDK 8](https://adoptium.net/temurin/releases/?version=8)（或 11），安装后：
  - IDEA 里：File → Project Structure → Project SDK 设为 8 或 11
  - 命令行：设置 `JAVA_HOME` 指向新装的 JDK（Maven 3.9 用 JDK 8 也能跑）
- 机器上现有的 JDK 21 可以保留，只是这个项目不用它运行。

### 2. Maven
- 国内下载依赖慢的话，给 `%MAVEN_HOME%\conf\settings.xml` 配置阿里云镜像：
  ```xml
  <mirror>
    <id>aliyun</id>
    <mirrorOf>central</mirrorOf>
    <url>https://maven.aliyun.com/repository/public</url>
  </mirror>
  ```

### 3. Nacos Server 2.x
两种方式任选其一：
- **方式 A（Windows 直接跑）**：解压 `nacos-server-2.x.zip`，进 `bin` 目录执行
  `startup.cmd -m standalone`（单机模式，不需要数据库）
- **方式 B（Docker）**：
  ```bash
  # ⚠️ 不要用 latest 标签！latest 是 Nacos 3.x，已停止支持 1.x 客户端（本项目客户端是 1.4.2）
  #    必须用 2.x 镜像，推荐 v2.5.3：
  docker run -d \
    --name nacos \
    -p 8848:8848 \
    -p 9848:9848 \
    -e MODE=standalone \
    -e NACOS_AUTH_ENABLE=false \
    nacos/nacos-server:v2.5.3
  # 查看日志，看到 "Nacos started successfully" 即成功
  docker logs -f nacos
  ```
  > WSL2 会自动把 localhost 转发到 WSL 里，Windows 上运行的 Java 服务配置
  > `localhost:8848` 就能连上 WSL 里的 Nacos，不用改地址。
  > `NACOS_AUTH_ENABLE=false`：关闭鉴权，学习阶段最省事。

启动成功后访问 **http://localhost:8848/nacos** 打开控制台（默认账号密码 `nacos/nacos`）。

### 4. IDE
推荐 IntelliJ IDEA。直接以 Maven 工程打开项目根目录，等依赖下载完即可。

---

## 三、目录结构

```
springcloud-learn
├── pom.xml                        # 父工程：统一版本管理（Spring Boot 2.3.12 + Hoxton + Alibaba 2.2.7）
├── README.md                      # 本文档
├── update-s.sh                    # ★ 一键更新脚本（改代码后：停容器→打包→复制jar→启动）
├── test-hystrix.sh                # ★ 第 4 步熔断演示脚本
├── test-gateway.sh                # ★ 第 5 步网关演示脚本
├── deploy                         # Docker 统一部署：compose 编排 + jars 目录
│   ├── docker-compose.yml         #   Nacos + 支付(x2) + 订单 + 网关（后两者按步骤用 profile 启用）
│   └── jars/                      #   统一存放打好的可执行 jar
├── cloud-api                      # 公共模块：实体类（Payment、CommonResult）
├── cloud-provider-payment         # 支付服务（提供者）：端口 8001/8002，注册 Nacos
│   └── controller/PaymentController.java   # 数据接口 + 慢调用/recover 演示开关
├── cloud-consumer-order           # 订单服务（消费者）：端口 80，调用支付服务
│   ├── config/ApplicationContextConfig.java # @LoadBalanced RestTemplate
│   ├── controller/OrderController.java      # 消费者接口（Feign 调用）
│   ├── service/PaymentFeignService.java     # Feign 接口（fallback 降级）
│   └── service/PaymentFeignServiceFallback.java # Hystrix 降级实现
└── cloud-gateway                  # API 网关：端口 9527
    └── filter/LogGlobalFilter.java           # 全局过滤器（访问日志）
```

端口一览：

| 服务 | 端口 | 说明 |
|---|---|---|
| Nacos | 8848 | 注册中心 |
| cloud-provider-payment | 8001 / 8002 | 服务提供者（两个实例演示负载均衡） |
| cloud-consumer-order | 80（宿主映射 9001） | 服务消费者 |
| cloud-gateway | 9527 | 网关统一入口 |

---

## 四、用 Docker 统一启动

### 1. 一键启动（Nacos + 支付 + 订单）

```bash
cd deploy
docker compose up -d            # 启动基础三件套
docker compose logs -f          # 看日志（Ctrl+C 退出，容器继续跑）
```

### 2. 改代码后的一键更新（推荐用脚本）

```bash
./update-s.sh                   # 更新全部服务（含 provider2、gateway）
./update-s.sh consumer          # 只更新订单服务
./update-s.sh gateway           # 只更新网关（首次会自动创建容器）
```

脚本做的事：**停容器 → mvn 打包 → 复制 jar → 启动**。细节：
- 自动检测 `cloud-api` 公共模块是否有改动，有则先 `mvn install`
- 同模块多实例（provider/provider2）**只打一次包、只复制一次**，避免运行中重写 jar 导致 JVM 崩溃
- 支持 compose profile 服务（gateway 带 `step5`）

### 3. 按步骤启动额外服务

```bash
docker compose --profile step2 up -d provider2   # 支付第二实例(8002)，演示负载均衡
docker compose --profile step5 up -d gateway     # 网关(9527)
```

### 4. 验证入口

| 地址 | 链路 |
|---|---|
| http://localhost:9001/consumer/payment/get/1 | 直连订单 → 支付（第 1~4 步） |
| http://localhost:9527/consumer/payment/get/1 | **走网关** → 订单 → 支付（第 5 步） |
| http://localhost:9527/payment/get/1 | 走网关直连支付（轮询 8001/8002） |
| http://localhost:8848/nacos | Nacos 控制台（nacos/nacos） |

### 5. 设计要点（Docker 部署不踩坑）

- **容器内 `localhost` 是容器自己**。compose 通过环境变量 `NACOS_SERVER_ADDR=nacos:8848`
  覆盖配置（yml 里是 `${NACOS_SERVER_ADDR:localhost:8848}`，本地 IDEA 跑默认值不变）。
- **provider2 / gateway 用 compose profile 隔离**，默认不启动。
- **服务间调用走 Nacos 服务发现（服务名）**，与容器 IP 无关。
- Nacos 带健康检查，其余服务等它就绪再启动，避免"注册失败"。

---

## 五、五步学习路线（全部完成 ✅）

### 第 1 步：Nacos 注册中心 ✅

**学什么**：服务注册与发现解决什么问题、服务名是什么、注册中心的"实时感知"。

**做了什么**：
- 两个服务启动后自动注册到 Nacos（`spring.application.name` 即服务名）
- 订单服务用 `DiscoveryClient` **手动**实现"发现 → 拼 URL → 调用"（教学写法）

**验证效果**（第 1 步代码已演进，可在 Nacos 控制台观察）：
- 控制台服务列表能看到 `cloud-provider-payment`、`cloud-consumer-order`
- 把支付服务**下线**，订单服务立刻返回"没有发现服务"；恢复后自动恢复 —— 注册中心的实时感知

**核心代码**（`OrderController` 当时的手动发现写法，现已替换）：
```java
List<ServiceInstance> instances = discoveryClient.getInstances("cloud-provider-payment");
ServiceInstance instance = instances.get(0);   // 手动取第一个实例
String url = "http://" + instance.getHost() + ":" + instance.getPort() + "/payment/get/" + id;
```

---

### 第 2 步：Ribbon 负载均衡 ✅

**学什么**：客户端负载均衡（在调用方选实例）、默认轮询策略、NacosRule 权重规则。

**做了什么**：
- `RestTemplate` 加 `@LoadBalanced`，删掉手动发现代码，直接按服务名调用
- 启动支付服务第二实例(8002)，Nacos 里 2 个实例
- `application.yml` 配置 `NacosRule`（基于 Nacos 权重的负载均衡规则）

**验证效果**：连续请求，`8001 → 8002` 轮询交替；把某实例权重调成 100，流量按权重倾斜。

**核心代码**：
```java
@Bean
@LoadBalanced   // 让 RestTemplate 拥有 Ribbon 客户端负载均衡能力
public RestTemplate restTemplate() { return new RestTemplate(); }
```
```java
// 直接写服务名，Ribbon 自动完成 发现 + 选实例 + 负载均衡
restTemplate.getForObject("http://cloud-provider-payment/payment/get/" + id, CommonResult.class);
```

> 💡 对比第 1 步：`discoveryClient.getInstances()` + 手动拼 URL → 一行服务名调用。这就是客户端负载均衡。

---

### 第 3 步：Feign 服务调用 ✅

**学什么**：声明式 HTTP 调用、接口即调用、和 RestTemplate 的对比。

**做了什么**：
- 启动类加 `@EnableFeignClients`
- 新建 `PaymentFeignService` 接口：`@FeignClient(name="cloud-provider-payment")` + 方法注解
- Controller 注入接口，删掉 RestTemplate

**验证效果**：接口调用与之前结果一致；方法签名有编译期检查，路径写错直接编译报错。

**核心代码**：
```java
@FeignClient(name = "cloud-provider-payment", fallback = PaymentFeignServiceFallback.class)
public interface PaymentFeignService {
    @GetMapping("/payment/get/{id}")
    CommonResult<Payment> getPaymentById(@PathVariable("id") Long id);
}
```
```java
// 一个方法调用 = 一次远程 HTTP 请求，Feign 内部自动完成 发现+负载均衡+调用
return paymentFeignService.getPaymentById(id);
```

> 💡 RestTemplate（手写 URL 字符串）→ Feign（接口声明），后者 IDE 补全 + 编译期检查。

---

### 第 4 步：Hystrix 熔断 ✅

**学什么**：服务降级、超时控制、熔断状态机（CLOSED → OPEN → HALF-OPEN）。

**做了什么**：
- 支付服务加 `/payment/timeout`（sleep 3s 模拟慢调用）+ `/payment/recover|fail` 演示开关
- 订单服务 `@EnableHystrix` + Feign 配 `fallback` 降级类
- 配置：超时 2s、10s 窗口 ≥5 请求且错误率 ≥50% 触发熔断、熔断后 10s 半开

**验证效果**（`./test-hystrix.sh` 一键演示完整生命周期）：

| 阶段 | 现象 |
|---|---|
| 正常调用 | 秒回成功 |
| 慢调用超时 | 2s 后返回"【降级】..."（fallback 兜底） |
| 连续失败 | 前几次 2s，之后 **0.00s 秒回** —— 熔断打开，不再进支付服务 |
| 熔断隔离 | 熔断期间 `get/1` 仍正常（熔断按方法独立） |
| 服务恢复 | 延迟清零后，半开状态放测试请求成功 → 熔断自动关闭 |

**核心代码**：
```java
@FeignClient(name = "cloud-provider-payment", fallback = PaymentFeignServiceFallback.class)
```
```yaml
hystrix:
  command:
    default:
      execution.isolation.thread.timeoutInMilliseconds: 2000   # 超时 2s
      circuitBreaker:
        requestVolumeThreshold: 5          # 10s 窗口 ≥5 请求才判断
        errorThresholdPercentage: 50       # 错误率 ≥50% 熔断
        sleepWindowInMilliseconds: 10000   # 熔断 10s 后半开
```

> 💡 熔断状态机：**CLOSED（关闭）→ OPEN（打开，快速失败）→ HALF-OPEN（半开放测试请求）→ CLOSED（恢复）**。

---

### 第 5 步：Gateway 网关 ✅

**学什么**：统一入口、路径断言、`lb://` 动态路由、全局过滤器。

**做了什么**：
- 网关注册到 Nacos，配置两条路由（`Path` 断言 + `lb://服务名` 动态路由）
- 新增 `LogGlobalFilter` 全局过滤器：打印每个请求的"收到 → 转发完成 → 耗时 → 状态码"

**验证效果**（`./test-gateway.sh` 一键演示）：

| 阶段 | 现象 |
|---|---|
| 统一入口 | `9527/consumer/**` → 订单服务 → Feign → 支付，链路全通 |
| 直接路由 | `9527/payment/**` → 支付服务，8001/8002 轮询 |
| 路径断言 | `/nonexistent/path` → 404，网关层直接拒绝 |
| 全局过滤器 | `docker logs cloud-gateway` 每个请求都有日志 |

**核心配置**：
```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: consumer-order-route
          uri: lb://cloud-consumer-order   # lb:// 从注册中心按服务名负载均衡
          predicates:
            - Path=/consumer/**
```

---

## 六、学习总结

### 1. 五步核心思想一句话

| 步骤 | 组件 | 一句话总结 |
|---|---|---|
| 注册中心 | Nacos | 服务启动"报个到"（注册），调用方"查个名单"（发现），上下线实时感知 |
| 负载均衡 | Ribbon | 调用方按服务名从名单里"挑一个"实例来调，默认轮询 |
| 服务调用 | Feign | 把"挑实例 + 发 HTTP"封装成接口，像调本地方法一样调远程 |
| 熔断 | Hystrix | 下游慢了/挂了，快速失败并兜底，别把故障拖垮整个调用链 |
| 网关 | Gateway | 所有请求一个入口，按路径路由到各服务，统一做过滤/鉴权/限流 |

### 2. 调用链代码演进（第 1 → 5 步的代码变迁）

```java
// 第 1 步：手动发现 + 拼 URL（约 10 行）
List<ServiceInstance> list = discoveryClient.getInstances(serviceName);
String url = "http://" + list.get(0).getHost() + ":" + list.get(0).getPort() + "/payment/get/" + id;
return restTemplate.getForObject(url, CommonResult.class);

// 第 2 步：@LoadBalanced + 服务名（1 行）
return restTemplate.getForObject("http://cloud-provider-payment/payment/get/" + id, CommonResult.class);

// 第 3 步：Feign 接口（0 行 URL，接口声明）
return paymentFeignService.getPaymentById(id);

// 第 4 步：+ fallback 降级（故障时自动兜底）
// 第 5 步：调用方换成网关地址，服务间调用代码完全不用改
```

### 3. 踩过的坑（经验值）

- **技术栈选型**：想体验 Hystrix/Ribbon 必须用 Boot 2.3 + Hoxton，JDK 17+ 跑不起来；Nacos 镜像别用 latest（3.x 不兼容 1.x 客户端）
- **容器与宿主机 localhost**：容器内 localhost 是容器自己，服务间必须走服务名发现
- **update-s.sh 竞态 bug**：多实例更新时，若每次都 `cp -f` 重写 jar，运行中的 JVM 懒加载会读到半截 jar 崩溃 → 改为同模块只打包复制一次 + 原地复制保持 inode + `up -d` 不重建
- **NacosRule 权重**：Nacos 控制台改过权重（如 100:1）后流量会严重倾斜，看起来像"没轮询"，其实是规则在正常工作
- **Hystrix 熔断时机**：请求少（<阈值）时不会熔断；慢请求跨越 10s 滑动窗口，熔断触发点会"延迟"

### 4. 后续可以继续学什么

- **Nacos 配置中心**：配置动态刷新（本项目的 nacos-discovery 可扩展 nacos-config）
- **Sentinel / Resilience4j**：Hystrix 的现代替代品（流控、熔断、系统保护）
- **网关进阶**：限流（RequestRateLimiter）、鉴权过滤器、跨域配置
- **链路追踪**：Sleuth + Zipkin 看一次请求在多个服务间的完整链路

---

## 七、常见问题

- **启动报端口被占用**：80 被占用就改 `cloud-consumer-order` 的 `server.port`
  （compose 里改 `"9001:80"` 左侧端口即可）
- **连不上 Nacos**：先确认 http://localhost:8848/nacos 能打开；Docker 部署时看
  `docker compose logs nacos` 是否出现 "Nacos started successfully"
- **用 latest 镜像注册失败**：latest 是 Nacos 3.x，本项目客户端是 1.x，必须用 v2.5.3
- **Docker 里服务注册失败、报连接 localhost:8848 超时**：jar 是旧配置，重新
  `./update-s.sh`（yml 已支持 `${NACOS_SERVER_ADDR}` 环境变量）
- **依赖下载慢**：配置阿里云镜像（见环境清单）
- **update-s.sh 更新后服务没反应**：脚本对已存在容器不重建（`up -d`），若容器配置异常可用
  `docker compose up -d --force-recreate <服务名>` 强制重建
