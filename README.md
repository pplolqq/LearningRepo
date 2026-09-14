# 本地服务网关（gateway_local_tool）

一个很轻的本地网关页：首页把本机跑着的前端服务列成卡片，点一下就在网关里把它嵌着打开（iframe），左侧切服务、顶栏随时能开新标签，顺带显示每个端口是否还活着。

后端是零依赖的 Node 原生 HTTP 服务（`run_gateway_server.js`），前端是 `public/` 下三个静态文件。不需要 `npm install`，启动即用。

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

浏览器会自动打开 <http://127.0.0.1:5200/>。也可以直接 `node run_gateway_server.js`。

## 页面怎么用

| 操作 | 说明 |
| --- | --- |
| 点卡片 | 在网关里嵌着打开（左侧出服务列表，右侧是页面本身） |
| `Ctrl`/`⌘` + 点卡片 | 新标签页打开（浏览器原生行为，中键点击也一样） |
| 卡片上的「新标签 ↗」 | 新标签页打开这个服务 |
| 左侧列表 | 在嵌着的服务之间切换 |
| 顶栏「重新加载」 | 重建 iframe，等于刷新当前服务 |
| 顶栏「在新标签打开 ↗」 | 当前服务开新标签页 |
| `/` | 聚焦搜索框（只在首页） |
| 输入关键字 | 按名称、描述、端口、标签实时过滤 |
| 回车 | 打开过滤后的第一个服务 |
| `1`–`9` | 直接切到/打开对应序号的服务 |
| `R` | 立刻重新检测端口 |
| `Esc` | 首页：清空搜索；工作台：回到首页 |
| 卡片上的「复制」 | 复制服务地址 |

状态灯每 5 秒自动刷新（标签页在后台时暂停，切回来立即刷新）。绿灯表示端口有人监听，红灯表示服务还没启动——红灯卡片照样能点，进来会看到「服务还没启动」的提示，等服务起来后会自动把页面加载进来，不用手动刷新。

当前地址带在 hash 里（`#/note`），刷新浏览器或直接贴着这个地址打开都会回到同一个服务上。

## 关于 iframe 的几个坑

这版是「网关当壳」的思路：不改任何前端，靠 iframe 把页面嵌进来。有几件事是它的物理限制，先知道比踩到再查好：

目标页面可以拒绝被嵌入。它只要返回 `X-Frame-Options: DENY/SAMEORIGIN` 或者带 `frame-ancestors` 的 CSP，浏览器就不给显示。网关会在嵌之前先问后端 `/api/embed`（后端去读目标响应头，不受 CORS 限制），遇到这种页面直接显示「这个页面不允许被嵌入」，而不是甩一个空白框。想确认是真拦还是误判，点「仍然尝试加载」就能强制嵌一次。

焦点在 iframe 里时，父页面收不到键盘事件。这是浏览器的规则，不是 bug。所以 `/`、`Esc`、`R`、`1`–`9` 这些快捷键只在焦点还在网关自己身上（比如刚点过左侧列表或顶栏）时有效；一旦你在内嵌页面里点了输入框，键盘就归那个页面了。切服务用鼠标点左侧列表最稳。

少数页面会自己跳出 iframe。用了 `window.top.location`、`target="_top"`、或者跳去 OAuth 登录的前端，会把自己弹出到顶层或新窗口。遇到就把这种服务固定用「在新标签打开」。

浏览器的前进/后退会带上 iframe 内部的历史。因为 iframe 里的导航也会往同一个标签页的历史里塞记录，所以从工作台按后退，可能先撤销内嵌页面上一次的跳转，再回到首页。

localhost 的不同端口算「同站不同源」。所以 cookie 不会被当成第三方 cookie 拦，`localStorage` 之类仍然是各端口各一份，内嵌页面的行为和自己单独打开时一致。

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
| `scheme` | 否 | 默认 `http`，目标是 https 就填 `https` |
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
| `GATEWAY_EMBED_CACHE` | `30000` | 「能不能被嵌入」的检测结果缓存多久（毫秒） |
| `NOTE_PORT` / `SEEKFILE_PORT` | `5202` / `9993` | 覆盖对应服务的端口 |

想换默认端口，直接改 `services.json` 里的 `gateway.port`；`GATEWAY_PORT` 优先级更高。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/config` | 网关标题 + 服务列表（已套用环境变量覆盖） |
| `GET` | `/api/status` | 各服务探活结果：`{ online, ms }` |
| `GET` | `/api/embed?id=note` | 目标能不能被 iframe 嵌入：`{ embeddable, reason }`，`reason` 取值 `null` / `x-frame-options` / `csp-frame-ancestors` / `unreachable` |
| `GET` | `/api/health` | 网关自身存活检查 |

端口探活和嵌入检测都放在后端做：浏览器直接 fetch 另一个端口会被 CORS 拦住，后端做没这个问题，也不依赖页面是从 `localhost` 还是局域网 IP 打开的。

## 和 `run_wsl.sh` 的关系

`run_wsl.sh` 负责在 WSL 里起 noteTp（5202）和 seekFile（9993）；这个网关只负责「跳过去」和「看它活没活」，不管启动服务。两边端口保持一致就行——`NOTE_PORT`、`SEEKFILE_PORT` 用的是同一组变量名。
