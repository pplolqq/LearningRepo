下面把你这一路从「Windows 代理 PID 2704 + WSL mirror 模式 → WSL 内 SSH 成功连 GitHub」的完整闭环整理成一份可复用的 SOP，按时间顺序，含每一步在解决什么问题。

---

## 0. 环境画像（起点）

- Windows 侧：Clash / Mihomo / v2rayN 类代理，PID 2704，开 **TUN 模式**
  - DNS 改到 `127.0.0.1`
  - 对 HTTPS 做透明 MITM（自带自签 CA，装进 Windows 证书库）
  - 监听 `0.0.0.0:80` / `0.0.0.0:443` 是 TUN 接管入口，不是普通 HTTP 服务
- WSL2：开 **mirror 模式**（`networkingMode=mirrored` + `dnsTunneling=true` + `autoProxy=true`）
  - WSL 的 `127.0.0.1` ≈ Windows 的 `127.0.0.1`
  - DNS 请求走虚拟化通道，被 Windows TUN 接管
  - 出站 TCP 进 Windows 网络栈 → TUN → 代理节点
- 现象：WSL 里 `git pull https://github.com/...` 报
  `server certificate verification failed. CAfile: /etc/ssl/certs/ca-certificates.crt`
  因为 WSL 的 CA 包里没有代理的自签根。

---

## 1. 放弃 HTTPS 路线，选定 SSH-over-443

HTTPS 在 TUN MITM 下必须导入代理 CA 才稳；SSH 自身加密、TUN 只转发 TCP，不碰证书。
但 GitHub 默认 `22` 端口在代理/TUN/fake-IP 下容易被 `refused` 或 `kex closed`，改用 GitHub 官方备线 **`ssh.github.com:443`**。

---

## 2. Windows 侧：确认镜像网络配置

`C:\Users\<你>\.wslconfig`

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true
```

PowerShell 重启 WSL 生效：

```powershell
wsl --shutdown
```

重开 Ubuntu。Mirror 模式下 WSL 出站自然进 Windows TUN，不需要在 WSL 设 `http_proxy` 给 SSH 用。

---

## 3. WSL 侧：生成 SSH 密钥并注册到 GitHub

```bash
ssh-keygen -t ed25519 -C "pplolqq@wsl"
cat ~/.ssh/id_ed25519.pub
```

把公钥贴到 GitHub → Settings → SSH and GPG keys。
（Windows 的 SSH key 和 WSL 的互相独立，必须在 WSL 里生成或拷进来并改权限。）

---

## 4. WSL 侧：写 `~/.ssh/config`（核心）

```sshconfig
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

> mirror+TUN 下**不需要** `ProxyCommand`；TUN 已经透明转发 TCP。加了反而可能双层代理。

权限：

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

---

## 5. 预写 known_hosts（避免交互或排查时混淆）

```bash
ssh-keyscan -p 443 ssh.github.com >> ~/.ssh/known_hosts
```

GitHub 官方 ED25519 指纹：
`SHA256:+DiY3wvvV6TuJjbpZisF/zLDA0zPMSvHdkr4UvCOqU`
首次 `ssh -T` 提示时 `yes` 也行。

---

## 6. 连通性验证（分段定位）

Windows PowerShell 先测（同 TUN 栈）：

```powershell
ssh -T -p 443 git@ssh.github.com
```

WSL 里测：

```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
ssh -vvT git@github.com
```

你过程中的演进：
1. 直连 `github.com:22` → `Connection refused`（TUN/fake-IP 不转发 22）
2. 改 `ssh.github.com:443` → 连到 `127.0.0.1:443`，SSH banner 前被断（mirror 下 127.0.0.1 映射 + TUN 处理 443 比 22 稳，但仍需 known_hosts/规则）
3. 写入 `ssh-keyscan` + 确认 config → `Hi pplolqq! You've successfully authenticated...`

---

## 7. Git 仓库切换 SSH remote

```bash
cd ~/projects/tmp_space
git remote set-url rt git@github.com:pplolqq/LearningRepo.git
git remote -v
git pull rt new_test
```

顺手清掉之前 HTTPS 排查残留：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
git config --global http.sslVerify true
git config --local http.sslVerify true 2>/dev/null || true
```

---

## 8. 最终稳态

- WSL git：走 `git@github.com:...` → SSH → `~/.ssh/config` 改写到 `ssh.github.com:443`
- TCP 出 WSL → Windows mirror 网络 → TUN → 代理节点 → GitHub
- SSH 握手端到端加密，代理看不到内容，不触发 CA 校验
- `sslVerify` 恢复 `true`，HTTPS 配置干净，无 `GIT_SSL_NO_VERIFY` 兜底

---

## 9. 以后换网络/关 TUN 的兜底

如果某天关了 Windows 代理，`ssh -T git@github.com` 超时：
- 要么重开 TUN
- 要么在 `~/.ssh/config` 加 `ProxyCommand nc -X 5 -x 127.0.0.1:<socks5端口> %h %p`（mirror 下 127.0.0.1 直接是代理）
- 要么把代理规则里 `github.com / ssh.github.com / 140.82.112.0/20 / 192.30.252.0/22` 设 DIRECT 或走节点，别 REJECT

---

整套逻辑一句话版：

> Windows TUN（PID 2704）做透明代理+HTTPS MITM → WSL mirror 模式让 WSL 共享 Windows 网络栈 → HTTPS 在 WSL 缺代理 CA 故失败 → 改用 SSH 且避开放 22 被拒，走 GitHub 官方 `ssh.github.com:443` → TUN 只转发 TCP 不解密 SSH → 密钥认证通过，git 永久脱坑。

这份流程可以直接存成笔记，下次重装 WSL 照抄 2→7 步即可。