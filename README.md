# seekFile

一个跑在本机的小型文件搜索界面，后端直接用 Everything 的 HTTP 服务。
Everything 负责索引和匹配，这里只做三件事：拼查询、整理结果、提供打开的入口。

只用 Python 标准库，没有第三方依赖。

## 前置条件

1. Everything 正在运行。
2. 在 Everything 里打开 HTTP 服务（工具 → 选项 → HTTP 服务器），端口设为 **9020**。
   如果换端口，设置环境变量 `SEEKFILE_EVERYTHING` 覆盖，例如
   `set SEEKFILE_EVERYTHING=http://127.0.0.1:12345/`。

## 启动

```bash
./run.sh          # 后台启动，默认端口 9999，日志写到 /tmp/seek_file.log
```

或者前台运行，方便直接看输出：

```bash
python run_seek_file.py
```

界面会自动在浏览器打开：<http://127.0.0.1:9999/>

| 环境变量 | 作用 | 默认值 |
| --- | --- | --- |
| `SEEKFILE_EVERYTHING` | Everything HTTP 地址 | `http://127.0.0.1:9020/` |
| `SEEKFILE_PORT` | 本界面监听端口 | `9999`（与 `run.sh` 一致） |
| `SEEKFILE_NO_BROWSER` | 设为 1 则不自动开浏览器 | 未设置 |
| `SEEKFILE_VERBOSE` | 设为 1 打印每条请求日志 | 未设置 |

## 用法

- 直接在搜索框输入。**支持 Everything 原生语法**，比如 `ext:md`、`path:C:\Work`、
  `size:>100mb`、`dm:today`、`!ext:zip`。
- 分类按钮（图片 / 文档 / 视频 / 代码 …）会展开成 `ext:` 宏，与搜索词叠加。
- 点 `正则` 后按正则表达式匹配。
- 点 `正则` 后再勾 `正则匹配路径`，正则就会匹配**完整路径**而不只是文件名。
- `范围` 把搜索限定到某个目录；`排序` / `↓` 控制排序和方向。

| 操作 | 动作 |
| --- | --- |
| 移动鼠标 | 切换选中项（指针停在哪一行就选中哪一行） |
| `↑` `↓` | 切换选中项 |
| 单击 | **只选中，不执行任何操作** |
| 双击 / `Enter` | 在资源管理器中定位 |
| 右键 | 在资源管理器中定位 |
| `Alt` + `Enter` | 用默认程序打开 |
| `Ctrl` + `C` | 复制完整路径 |
| `/` | 聚焦搜索框 |
| `Esc` | 清空并重新聚焦 |

定位对文件和文件夹一视同仁：都打开**所在目录**并选中该项（`explorer /select`），
所以点文件夹不会直接进到里面，而是停在它的上一层。

程序类文件（`.exe` `.bat` `.ps1` 等）只有用 `Alt` + `Enter` 打开时才会先弹确认，
避免误运行；双击和 `Enter` 一律只做定位，不会启动任何程序。

## 关于 Everything HTTP 接口的几个坑

下面每一条都在 Everything **1.4.1.1032** 的 HTTP 服务上实测过，代码里的写法就是为了绕开它们：

| 现象 | 说明 |
| --- | --- |
| 全局 `regex=1` 会让宏全部失效 | 开启正则后 `ext:` `path:` `folder:` 一律返回 0 条。改用内联 `regex:模式` 并保持 `regex=0`，宏和正则就能共存。 |
| 正则默认只匹配文件名 | 需要额外加 `path=1` 才会匹配完整路径。 |
| `path` 参数不能用来限定范围 | `?path=C:\X` 被忽略；限定范围必须写进搜索串 `path:C:\X`。 |
| 含空格的路径必须加引号 | `path:C:\Program Files` 只返回 1 条，`path:"C:\Program Files"` 返回 2769 条。 |
| 降序参数不是 `asc` | `asc`、`desc`、`descending`、`order` 全部被忽略；真正生效的是 `ascending=0`（降序）。 |
| 只有 4 个字段可用 | 只返回 `name`/`path`/`size`/`date_modified`，`extension_column`、`date_created_column` 等一律被忽略，所以扩展名在这里自行推导。 |
| 非法正则静默返回 0 条 | 不报错。后端会先用 Python 校验一遍，把错误显示在界面底部。 |
| 日期是 Windows FILETIME | `date_modified` 是 1601 年起的百纳秒整数，后端会转成 ISO 时间。 |
| 中文文件名是好的 | 返回的是标准 UTF-8 JSON，不是乱码；早先在控制台看到的是终端编码显示问题。 |

## 安全性

Everything 的 HTTP 服务没有鉴权，所以两边都只绑定 `127.0.0.1`。

`/api/open` 和 `/api/reveal` 会在你机器上启动进程，因此后端会校验 `Host`
和 `Origin`，拒绝不是来自本机界面的请求（这能挡住网页跨站调用和 DNS rebinding）。
启动进程前还会确认路径真实存在。

## 文件

| 文件 | 说明 |
| --- | --- |
| `run_seek_file.py` | 后端：查询拼装、结果整理、打开/定位接口 |
| `web/index.html` | 前端：单文件，无构建步骤 |
| `run.sh` | 启动脚本（后台运行，默认端口 9999） |
| `tools/everything-http.*` | 开关 Everything 的 HTTP 服务（含交互菜单） |
| `test_api.py` | 接口回归测试，需服务已启动 |

跑测试：

```bat
python test_api.py
```
