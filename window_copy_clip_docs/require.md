---

# 需求：cfclip — Windows 剪贴板单文件复制工具（C）

## 一、目标

写一个 **Windows 命令行程序 `cfclip.exe`**，把**单个文件**以 `CF_HDROP` 格式写入剪贴板，使得 QQ / 微信 / Electron 应用能通过 Ctrl+V 接收。

等价行为：

```powershell
Add-Type -AssemblyName System.Windows.Forms
$p = New-Object System.Collections.Specialized.StringCollection
$p.Add("C:\absolute\path\to\file.txt")
[System.Windows.Forms.Clipboard]::SetFileDropList($p)
```

## 二、用法

```bash
cfclip.exe ./pom.xml
cfclip.exe "C:\Windows\notepad.exe"
cfclip.exe /c/Users/me/test.png
cfclip.exe "file with spaces.txt"
```

- 只处理**一个文件**（多余参数忽略或报错均可）
- 支持相对路径（相对于 cwd 解析为绝对路径）
- 支持 Git Bash `/c/xxx` 风格路径 → `C:\xxx`
- 支持空格文件名
- 文件不存在时报错退出


---
