## 在 Windows 下往剪贴板写文件，让 QQ Ctrl+V 能认——技术选型全景

### 核心原理

> **QQ 认的是格式正确的 `CF_HDROP`，不是非得走 OLE。** 之前绕了大弯以为是 API 路线问题，实际是 DROPFILES 二进制格式写错了（少了 4 字节 `fWide` 字段 + 路径前缀多了空字符串）。

---

### 四种方案对比

| 方案 | 启动开销 | 兼容性 | 复杂度 | 评价 |
|------|---------|--------|--------|------|
| **PowerShell** `SetFileDropList` | ~200-400ms | ✅ 系统原生 | 最低 | 最省心，但慢 |
| **C** `SetClipboardData(CF_HDROP)` | ~5-15ms | ✅ 系统原生 | 最高 | 最快，但维护成本大 |
| **Python** `win32clipboard` + 正确 DROPFILES | ~30-50ms | ✅ 格式正确就行 | 中等 | 性价比最高 |
| **Bash/Git Bash** 直接写 | ❌ 模拟层 | ❌ 不行 | — | 别想了 |

---

### 各环境定位

```
┌─────────────────────────────────────────────────────────┐
│                    Windows 桌面                          │
├─────────────────────────────────────────────────────────┤
│  PowerShell    │  最原生，系统信任，启动慢               │
│  C 可执行文件  │  最原生，最快，编译部署麻烦             │
│  Python        │  够用，格式正确就通，启动适中           │
│  Bash/Git Bash │  路径风格怪，模拟层，不适合直接操作     │
└─────────────────────────────────────────────────────────┘
```

---

### 选型决策树

```
需要复制文件到剪贴板？
  │
  ├─ 在 PowerShell / CMD 里直接用？
  │     → PowerShell SetFileDropList（最省心）
  │
  ├─ 在 Bash/Git Bash 里？
  │     → 用 Python 做路径解析 + 写入（抹平 Bash 的路径怪癖）
  │     → 或者 Bash 里调 cfclip.exe（C 版，最快）
  │     → 实在不行 Bash 里调 PS（慢但稳）
  │
  ├─ 对速度有极致要求？
  │     → C 版 cfclip.exe（5ms）
  │
  ├─ 想要代码简洁、好维护？
  │     → Python 版（~50行核心逻辑）
  │
  └─ 跨程序都要认（QQ/微信/Electron）？
        → 格式正确就行，不需要 OLE
        → CF_HDROP + 20字节 DROPFILES + fWide=1 + UTF-16LE
```

---

### 最终推荐

| 场景 | 推荐 |
|------|------|
| 日常命令行工具 | **Python 版**（简洁、正确、跨环境） |
| 集成到工具链/脚本 | **Python 版** + Bash alias 调 `python cpl.py` |
| 对延迟敏感（批量/高频） | **C 版 cfclip.exe** |
| 不想维护任何代码 | **PowerShell 一行命令** |
| Git Bash 里想 `cpl ./xxx` | Python 做入口 → 内部写剪贴板（或 subprocess 调 cfclip.exe） |

---

### 关键教训（给自己备忘）

> **1. 底层二进制格式先验证，再怀疑架构层。**
> **2. `struct.pack` 的字段数 = C 结构体的实际字段数，差一个都不行。**
> **3. CF_HDROP 的 DROPFILES 是 20 字节，不是 16。**
> **4. `fWide=1` 是 UTF-16LE 的关键开关。**
> **5. 文件列表不要以空字符串开头。**

---

### 文件清单（最终可用版）

| 文件 | 用途 |
|------|------|
| `cpl.py` | Python 版，日常主力 |
| `cfclip.c` + `cfclip.exe` | C 版，性能极限 |
| `cpl.ps1` | PS 版，备用/验证 |
| `test_clip.c` / `test_clip.exe` | 剪贴板格式验证工具 |

---

一句话收尾：**Python 写对格式就能通，C 最快最原生，PowerShell 最省心，Bash 别直接搞——用 Python 或 C 做后端抹平。**