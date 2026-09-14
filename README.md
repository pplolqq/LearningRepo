# 本地服务网关（gateway_local_tool）

一个很轻的本地网关页：把本机跑着的前端服务列成卡片，点一下直接跳过去，顺带显示每个端口是否还活着。

后端是零依赖的 Node 原生 HTTP 服务（`server.js`），前端是 `public/` 下三个静态文件。不需要 `npm install`，启动即用。

## 快速开始

```powershell
# Windows PowerShell
cd C:\Users\zrj21\Desktop\Agent\gateway_local_tool
.\start.ps1
```

```bash
# bash / WSL / macOS
./start.sh
```

浏览器会自动打开 <http://127.0.0.1:5200/>。也可以直接 `node server.js`。

## 页面怎么用

| 操作 | 说明 |
| --- | --- |
| 点卡片 | 新标签页打开对应服务 |
| `/` | 聚焦搜索框 |
| 输入关键字 | 按名称、描述、端口、标签实时过滤 |
| 回车 | 打开过滤后的第一个服务 |
| `1`–`9` | 直接打开对应序号的卡片 |
| `R` | 立刻重新检测端口 |
| `Esc` | 清空搜索 |
| 卡片上的「复制」 | 复制服务地址 |

状态灯每 5 秒自动刷新（标签页在后台时暂停，切回来立即刷新）。绿灯表示端口有人监听，红灯表示服务还没启动——红灯卡片照样能点，方便先开着页面等服务起来。

## 增删服务

改 `services.json` 就行，保存后刷新页面即生效（后端每次请求都重读配置，不用重启进程）。

```json
{
  "id": "note",
  "name": "Note TipTap",
  "description": "笔记应用前端",
  "port": 5202,
  "envPort": "NOTE_PORT",
  "path": "/",
  "color": "#6ea8fe",
  "tags": ["Note", "Vite"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 卡片标题 |
| `port` | 是* | 服务端口，地址按「当前页面的 host + 这个端口」拼出来 |
| `url` | 否 | 填了就优先用它，适合指向别的机器或外部地址；填了 `url` 就不做端口探活 |
| `envPort` | 否 | 用哪个环境变量覆盖 `port`，例如 `NOTE_PORT` |
| `path` | 否 | 默认 `/`，例如填 `/docs` |
| `probeHost` | 否 | 探活用的地址，默认 `127.0.0.1` |
| `color` | 否 | 卡片强调色 |
| `tags` | 否 | 卡片上的小标签 |

\* `port` 和 `url` 至少要有一个。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GATEWAY_PORT` | `5200` | 网关自己的端口 |
| `GATEWAY_HOST` | `127.0.0.1` | 设成 `0.0.0.0` 可以让局域网里的手机也打开 |
| `GATEWAY_CONFIG` | `./services.json` | 配置文件路径 |
| `GATEWAY_PROBE_TIMEOUT` | `1200` | 单次探活超时（毫秒） |
| `NOTE_PORT` / `SEEKFILE_PORT` | `5202` / `9993` | 覆盖对应服务的端口 |

想换默认端口，直接改 `services.json` 里的 `gateway.port`；`GATEWAY_PORT` 优先级更高。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/config` | 网关标题 + 服务列表（已套用环境变量覆盖） |
| `GET` | `/api/status` | 各服务探活结果：`{ online, ms }` |
| `GET` | `/api/health` | 网关自身存活检查 |

端口探活放在后端做：浏览器直接 fetch 另一个端口会被 CORS 拦住，后端探活没这个问题，也不依赖页面是从 `localhost` 还是局域网 IP 打开的。

## 和 `run_wsl.sh` 的关系

`run_wsl.sh` 负责在 WSL 里起 noteTp（5202）和 seekFile（9993）；这个网关只负责「跳过去」和「看它活没活」，不管启动服务。两边端口保持一致就行——`NOTE_PORT`、`SEEKFILE_PORT` 用的是同一组变量名。
