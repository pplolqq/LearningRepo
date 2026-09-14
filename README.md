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
./run.sh
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
| 卡片上的「启动」 | 服务离线时才出现，调本机启动脚本把它拉起来 |
| 工作台里的「本地启动」 | 同上；服务起来后下面的页面会自己加载进来 |
| `/` | 聚焦搜索框（只在首页） |
| 输入关键字 | 按名称、描述、端口、标签实时过滤 |
| 回车 | 打开过滤后的第一个服务 |
| `1`–`9` | 直接切到/打开对应序号的服务 |
| `R` | 立刻重新检测端口 |
| `Esc` | 首页：清空搜索；工作台：回到首页 |
| 卡片上的「复制」 | 复制服务地址 |

状态灯每 5 秒自动刷新（标签页在后台时暂停，切回来立即刷新）。绿灯表示端口有人监听，红灯表示服务还没启动——红灯卡片照样能点，进来会看到「服务还没启动」的提示，等服务起来后会自动把页面加载进来，不用手动刷新。

当前地址带在 hash 里（`#/note`），刷新浏览器或直接贴着这个地址打开都会回到同一个服务上。

## 启动按钮

服务没起来的时候，卡片上会多一个「启动」，工作台的占位提示里也能点「本地启动」。点下去就是让后端替你跑一次启动脚本，不用再切到终端。

脚本用的是现成的 `run_wsl.sh`，只是给它加了个参数分发，两个服务各自的启动函数原样没动：

```bash
bash run_wsl.sh          # 不带参数，两个都起（原来的行为）
bash run_wsl.sh note     # 只起 noteTp
bash run_wsl.sh seekfile # 只起 seekFile
```

哪个服务对应哪个参数写在 `services.json` 的 `startArgs` 里，所以加新服务只要在脚本里加一个分支、再在配置里写上参数。

点完之后有三种结果：

脚本很快跑完并正常退出 → 提示「启动脚本执行完了」。

进程一直挂在那（dev server 常驻的情况）→ 8 秒后当作成功，提示「已发起启动，等端口起来…」，接下来靠端口探活确认，绿灯一亮下面的页面会自己加载，不用手动刷新。

脚本报错退出、或者 `bash` 根本拉不起来 → 提示「启动失败」，工作台的占位里会把退出码和脚本输出摊出来，方便看是哪一步挂了。

同一个服务在启动过程中会被锁住，连点会提示「正在启动中，稍等一下」，避免拉出两份。

一点安全提醒：这个按钮等于给页面开了「在本机执行脚本」的口子。默认只监听 `127.0.0.1` 没问题，但如果你把 `GATEWAY_HOST` 设成 `0.0.0.0` 让局域网能访问，同网段的人也能点这个按钮。

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
| `startArgs` | 否 | 传给启动脚本的参数，例如 `["note"]`；不填就没有启动按钮 |
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
| `GATEWAY_START_SCRIPT` | 取 `gateway.startScript` | 启动脚本路径，默认 `run_wsl.sh` |
| `GATEWAY_BASH` | 取 `gateway.bash` | 用哪个 bash 跑启动脚本，默认找 PATH 里的 `bash` |
| `GATEWAY_START_WAIT` | `8000` | 等启动脚本「是常驻还是跑完」的观察窗口（毫秒） |
| `NOTE_PORT` / `SEEKFILE_PORT` | `5202` / `9993` | 覆盖对应服务的端口 |

想换默认端口，直接改 `services.json` 里的 `gateway.port`；`GATEWAY_PORT` 优先级更高。

关于 `GATEWAY_BASH`：这台机器上 PATH 里的 `bash` 是 Git Bash（`E:\DEPENDENCES\Git\usr\bin\bash.exe`），`run_wsl.sh` 本来就是给 Git Bash 写的（它内部再调 `wsl`，`start_seek_file` 用的是 `$HOME/Desktop/...` 这种 Git Bash 路径）。如果哪天你把网关改成在 WSL 里跑，`bash` 会变成 WSL 的 Linux bash，`$HOME` 就成了 `/home/...`，脚本会找不到 seekFile——那时候把 `GATEWAY_BASH` 指到 Git Bash 的绝对路径（或者改脚本里的路径）即可。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/config` | 网关标题 + 服务列表（已套用环境变量覆盖） |
| `GET` | `/api/status` | 各服务探活结果：`{ online, ms }` |
| `GET` | `/api/embed?id=note` | 目标能不能被 iframe 嵌入：`{ embeddable, reason }`，`reason` 取值 `null` / `x-frame-options` / `csp-frame-ancestors` / `unreachable` |
| `POST` | `/api/start?id=note` | 跑启动脚本。成功 `{ ok: true, running \| exited, output }`，失败 `{ ok: false, error, output }` |
| `GET` | `/api/health` | 网关自身存活检查 |

端口探活和嵌入检测都放在后端做：浏览器直接 fetch 另一个端口会被 CORS 拦住，后端做没这个问题，也不依赖页面是从 `localhost` 还是局域网 IP 打开的。

## 和 `run_wsl.sh` 的关系

`run_wsl.sh` 负责在 WSL 里起 noteTp（5202）和 seekFile（9993）；这个网关只负责「跳过去」和「看它活没活」，不管启动服务。两边端口保持一致就行——`NOTE_PORT`、`SEEKFILE_PORT` 用的是同一组变量名。
