# Windows 剪贴板写入工具 — 学习笔记

两个极简 C 程序，演示如何用 Win32 API 往 Windows 剪贴板写数据：

| 程序 | 功能 | 剪贴板格式 |
|------|------|-----------|
| `cfclip.exe` | 把**一个文件**放入剪贴板，QQ / 微信 / Electron 可按 Ctrl+V 接收 | `CF_HDROP`（文件拖放列表） |
| `clip666.exe` | 把**一段文本**放入剪贴板 | `CF_UNICODETEXT`（Unicode 文本） |

---

## 一、编译命令

环境：MinGW-w64（`gcc`）。关键点：用了 `wmain`，必须加 `-municode`。

```bash
# 文件复制工具
gcc -O2 -Wall -Wextra -municode cfclip.c -o cfclip.exe -lshell32 -luser32 -lgdi32

# 文本填充工具
gcc -O2 -Wall -Wextra -municode clip666.c -o clip666.exe -luser32
```

> 说明：剪贴板、`GlobalAlloc` 等核心 API 在 `kernel32` / `user32` 里，MinGW 默认已链接，`-luser32` 等显式写出只是为了清晰。

---

## 二、运行方式

```bash
# 1) 把文件放入剪贴板（相对路径、绝对路径、空格文件名都行）
./cfclip.exe "test file.txt"
./cfclip.exe "C:\Windows\notepad.exe"

# 2) 把文本放入剪贴板
./clip666.exe
```

**验证剪贴板内容**（PowerShell）：

```powershell
# 验证文件
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::GetFileDropList()

# 验证文本
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::GetText()
```

---


## 四、核心原理

### 4.1 剪贴板写入的标准流程

两个程序共用同一套「五步走」，只是格式和数据不同：

```
GlobalAlloc  ──►  分配一块全局内存（剪贴板要求 HGLOBAL）
GlobalLock   ──►  拿到可写指针，写入数据
GlobalUnlock ──►  释放指针
OpenClipboard ──►  打开剪贴板（同一时刻只允许一个进程）
EmptyClipboard ──► 清空旧内容
SetClipboardData ──► 把 HGLOBAL 交给系统（所有权转移，之后不能再 GlobalFree）
CloseClipboard ──► 关闭
```

**关键点：`SetClipboardData` 成功后，内存归系统管**，即使程序退出，剪贴板数据仍然有效。只有**失败时**才需要自己 `GlobalFree`。

### 4.2 为什么用 `wmain` 而不是 `main`

- `main` 拿到的是窄字符（ANSI）参数，中文/特殊文件名会丢字符
- `wmain` 直接拿到宽字符（UTF-16）参数，任何 Unicode 文件名都不会损坏
- 代价：MinGW 编译时必须加 `-municode`

### 4.3 `CF_HDROP` 的内存布局

这是文件剪贴板的核心，布局必须精确：

```
+------------------+
|   DROPFILES 头   |  pFiles / pt / fNC / fWide
+------------------+
|  "C:\path\a.txt" |  宽字符文件路径
|        \0        |  第 1 个 NUL：字符串结束
|        \0        |  第 2 个 NUL：整个列表结束
+------------------+
```

- `pFiles = sizeof(DROPFILES)`：告诉接收方「文件列表从头的末尾开始」
- `fWide = TRUE`：声明列表用宽字符（否则按 ANSI 解析）
- **双 NUL 结尾是必须的**：文件列表是一个「以空字符串结尾的字符串数组」，少一个 NUL 接收方就解析不到

### 4.4 `CF_UNICODETEXT` 的格式

就是普通的 UTF-16 字符串 + 结尾 NUL，最简单：

```
"你好" 的字节序列：[4F 60][7D 59][00 00]
                   '你'    '好'    \0
```

### 4.5 踩过的坑

| 坑 | 原因 | 解决 |
|----|------|------|
| `DROPFILES` 未声明 | MinGW 的 `shellapi.h` 没导出该结构体 | 手动在源码里定义（字段与 Windows SDK 一致） |
| 编译链接报 `wmain` 相关错误 | MinGW 默认按 `main` 启动 | 加 `-municode` |
| 中文/空格文件名损坏 | 用了窄字符 `main` | 改用 `wmain` |

---

## 五、行为对照

| 场景 | `cfclip.exe` |
|------|-------------|
| 相对路径 | `GetFullPathNameW` 基于 cwd 解析为绝对路径 |
| 空格文件名 | ✅ 宽字符参数原生支持 |
| 文件不存在 | 报错，`exit=1`，不污染剪贴板 |
| 目录 | 报错（视为无效） |
| 无参数 | 打印用法，`exit=1` |

> 附：`/c/xxx` 类 Linux 风格路径在 Git Bash 下能用，是 **MSYS2 在传参前自动转换**的结果，并非程序实现；在 cmd / PowerShell 里直接传 `/c/xxx` 不会生效。
