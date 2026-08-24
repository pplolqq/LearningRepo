# springcloud-learn —— Spring Cloud 微服务入门学习项目

一个**由浅入深**的微服务学习 demo，围绕 5 个主题一步步搭建：

| 步骤 | 主题 | 组件 | 状态 |
|---|---|---|---|
| 第 1 步 | 注册中心 | Nacos | ✅ 代码已就绪，等你配好环境运行 |
| 第 2 步 | 负载均衡 | Ribbon（客户端） | ⏳ 第 1 步学完后进行 |
| 第 3 步 | 服务调用 | Feign（Spring Cloud OpenFeign） | ⏳ |
| 第 4 步 | 熔断 | Hystrix | ⏳ |
| 第 5 步 | 网关 | Gateway | ⏳ |

> 不使用数据库，业务全部用**内存 Map + 简单函数**模拟，聚焦"微服务基础设施"本身。

---

## 一、为什么是这个技术栈（先看这段）

| 组件 | 版本 |
|---|---|
| JDK | **8 或 11**（必须，原因见下） |
| Spring Boot | 2.3.12.RELEASE |
| Spring Cloud | Hoxton.SR12 |
| Spring Cloud Alibaba | 2.2.7.RELEASE |
| Nacos Server | 2.x（2.2.x / 2.3.x 均可） |

**为什么不用你机器上的 JDK 21 / Spring Boot 3？**
因为 Hystrix 和 Ribbon 在 Spring Cloud 2020.0（对应 Spring Boot 2.4）之后被官方移出维护，
**只有 Spring Boot 2.3.x + Spring Cloud Hoxton 这个组合能同时"原汁原味"体验
Nacos + Ribbon + Feign + Hystrix + Gateway 五件套**，这是国内微服务入门教程最经典的组合。
代价是它无法运行在 JDK 17+ 上，所以需要 JDK 8 或 11。

> 补充：Hystrix 已停止维护，生产环境推荐 Sentinel / Resilience4j，但 Hystrix 的
> 熔断、降级设计思想至今通用，作为入门学习完全值得。

---

## 二、环境准备清单（请先完成）

### 1. JDK 8 或 11（必需）
- 下载 [Temurin JDK 8](https://adoptium.net/temurin/releases/?version=8)（或 11），安装后：
  - IDEA 里：File → Project Structure → Project SDK 设为 8 或 11
  - 命令行：设置 `JAVA_HOME` 指向新装的 JDK（Maven 3.9 用 JDK 8 也能跑）
- 你机器现有的 JDK 21 可以保留，别删，只是这个项目不用它运行。

### 2. Maven（你已有 3.9.11 ✅）
- 国内下载依赖慢的话，给 `%MAVEN_HOME%\conf\settings.xml` 配置阿里云镜像：
  ```xml
  <mirror>
    <id>aliyun</id>
    <mirrorOf>central</mirrorOf>
    <url>https://maven.aliyun.com/repository/public</url>
  </mirror>
  ```

### 3. Nacos Server 2.x（你正在下载 ✅）
两种方式任选其一：
- **方式 A（Windows 直接跑）**：解压 `nacos-server-2.x.zip`，进 `bin` 目录执行
  `startup.cmd -m standalone`（单机模式，不需要数据库）
- **方式 B（Docker，跑在你的 WSL 里）**：
  ```bash
  docker run -d --name nacos -p 8848:8848 -p 9848:9848 -e MODE=standalone nacos/nacos-server:v2.2.3
  ```
  > WSL2 会自动把 localhost 转发到 WSL 里，所以 Windows 上运行的 Java 服务
  > 配置 `localhost:8848` 就能连上 WSL 里的 Nacos，不用改地址。

启动成功后访问 **http://localhost:8848/nacos** 打开控制台（默认账号密码 `nacos/nacos`）。

### 4. IDE
推荐 IntelliJ IDEA。直接以 Maven 工程打开项目根目录，等依赖下载完即可。

---

## 三、目录结构

```
springcloud-learn
├── pom.xml                        # 父工程：统一版本管理（Spring Boot 2.3.12 + Hoxton + Alibaba 2.2.7）
├── README.md                      # 本文档
├── cloud-api                      # 公共模块：实体类（Payment、CommonResult）
├── cloud-provider-payment         # 支付服务（提供者）：端口 8001，注册 Nacos
├── cloud-consumer-order           # 订单服务（消费者）：端口 80，调用支付服务
└── cloud-gateway                  # API 网关：端口 9527（第 5 步启用）
```

端口一览：

| 服务 | 端口 | 说明 |
|---|---|---|
| Nacos | 8848 | 注册中心 |
| cloud-provider-payment | 8001（第 2 步再加 8002） | 服务提供者 |
| cloud-consumer-order | 80 | 服务消费者 |
| cloud-gateway | 9527 | 网关（第 5 步启用） |

---

## 四、五步学习路线

### 第 1 步：Nacos 注册中心（代码已就绪 ✅）

**学什么**：什么是服务注册与发现、Nacos 控制台长什么样、服务名是什么。

**运行步骤**：
1. 启动 Nacos（见环境清单），浏览器打开 http://localhost:8848/nacos 能登录
2. 启动 `PaymentApplication8001`（支付服务，端口 8001）
3. 启动 `OrderApplication80`（订单服务，端口 80）
4. 打开 Nacos 控制台 → 服务管理 → 服务列表，应能看到两个服务：
   `cloud-provider-payment` 和 `cloud-consumer-order`
5. 浏览器访问 **http://localhost/consumer/payment/get/1**，能看到支付服务返回的数据
6. 看订单服务控制台，有日志打印"发现实例 1 个，本次调用：http://...:8001/..."

**动手任务**：
- 在 Nacos 控制台把 `cloud-provider-payment` 下线（操作列→下线），再刷新页面，
  订单服务会提示"没有发现服务"，体会注册中心的"实时感知"作用，然后恢复上线。
- 试着访问 http://localhost/consumer/payment/get/99 ，观察错误提示。

**代码导读**（读这几个文件，配合上面运行体验理解）：
- `OrderController.getPayment()`：用 `DiscoveryClient` 手动做"发现→拼 URL→调用"
- `PaymentController`：提供者接口，打印端口方便观察
- 两个服务的 `application.yml`：`spring.application.name` 就是注册到 Nacos 的服务名

**完成标准**：你能说出"服务发现"解决了什么问题，Nacos 服务列表里能看到两个服务。

> 学完这一步告诉我，我们进入第 2 步：Ribbon 负载均衡（会再启动一个 8002 实例，
> 把"手动发现代码"换成 `@LoadBalanced`，观察请求在两个实例间轮询）。

### 第 2 步：Ribbon 负载均衡（进行中）

**学什么**：客户端负载均衡是什么、Ribbon 怎么按服务名选实例、默认轮询策略。

**要改的代码**（只有两处）：
- `ApplicationContextConfig.restTemplate()`：解开 `@LoadBalanced` 注释
- `OrderController`：删除"手动发现"代码，改用服务名直接调用

**要做的操作**：以 `--server.port=8002` 再启动一个支付服务实例（或复制配置），
让 Nacos 里 `cloud-provider-payment` 有 2 个实例，连续刷新页面观察轮询。

### 第 3 步：Feign（OpenFeign）服务调用

**学什么**：声明式 HTTP 调用、Feign 接口怎么写、和 RestTemplate 的对比。

**要改的代码**：启动类加 `@EnableFeignClients`；新建一个 Feign 接口；
Controller 从"手动调"换成"接口调"。

### 第 4 步：Hystrix 熔断

**学什么**：服务降级、超时控制、熔断触发与恢复。

**要改的代码**：提供者加一个"模拟延迟"接口；消费者配置 fallback 方法；
观察超时降级、连续失败触发熔断、熔断后自动恢复。

### 第 5 步：Gateway 网关

**学什么**：统一入口、路由断言、lb:// 动态路由、全局过滤器。

**要改的代码**：主要是配置 + 一个全局过滤器示例；把消费者接口地址换成网关地址访问。

---

## 五、常见问题

- **启动报端口被占用**：80 端口被占用就改 `cloud-consumer-order` 的 `server.port`
- **连不上 Nacos**：先确认 Nacos 已启动且 http://localhost:8848/nacos 能打开
- **依赖下载慢**：配置阿里云镜像（见环境清单）
