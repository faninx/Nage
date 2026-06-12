# 纳格（Nage）部署文档

> 目标读者：想把这套系统部署到公网 VPS 的管理员。
>
> 范围：单 VPS + Caddy（自动 HTTPS）+ Docker Compose。
>
> 预计耗时：第一次 30-60 分钟，主要是 DNS 解析和等证书签发。

---

## 0. 架构总览

```
[ 用户浏览器 ]
      │ HTTPS (443)
      ▼
┌──────────────┐
│  Caddy 容器  │  ← 自动向 Let's Encrypt 申请证书、自动续期
│  (反代)      │
└──────┬───────┘
       │ HTTP (3000，内网)
       ▼
┌──────────────┐
│  app 容器    │  ← Next.js 16 + Node 24
│  (Next.js)   │
└──────┬───────┘
       │ 本机 socket（命名 volume）
       ▼
┌──────────────┐
│  SQLite 文件  │  ← 单文件 nage.db
└──────────────┘
```

持久化数据（用 Docker 命名 volume 存，跨容器重建不丢）：

| 容器内路径 | volume 名 | 内容 |
|------------|-----------|------|
| `/app/data` | `nage-data` | SQLite 数据库 |
| `/app/public/uploads` | `nage-uploads` | 用户上传的图片 |
| `/app/backups` | `nage-backups` | 定时备份 |
| `/data` / `/config` | `caddy-data` / `caddy-config` | Caddy 证书 |

---

## 1. 准备 VPS

### 1.1 推荐配置

- 1 vCPU / 1GB RAM 起步（2GB 留点余量）
- 系统：Ubuntu 24.04 LTS 或 Debian 12（bookworm）
- 公网 IPv4
- 域名（备案与否不影响 Caddy 申请证书，但国内服务器走 Cloudflare 之类可能更稳）

### 1.2 防火墙放行

- `22`（SSH）
- `80`（Caddy 申请 / 续期证书）
- `443`（HTTPS）

如果用云厂商安全组（AWS SG / 阿里云 ECS 安全组 / 腾讯云 CVM 安全组），**也要**放行这 3 个。

```bash
# UFW 示例
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 1.3 DNS 解析

把你的域名 A 记录指到 VPS 公网 IP：

```
nage.example.com  →  203.0.113.10
```

**等 5-10 分钟让 DNS 生效**再继续。Caddy 申请证书时必须能解析到这台机器。

---

## 2. 安装 Docker

```bash
# Ubuntu / Debian 通用
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# 退出重新登录让 docker 组生效

# 验证
docker --version
docker compose version
```

---

## 3. 部署项目

### 3.1 拉代码

```bash
sudo mkdir -p /opt/nage && sudo chown $USER:$USER /opt/nage
cd /opt/nage

# 方式 A：git clone
git clone <你的仓库 URL> .

# 方式 B：scp 上传（开发机执行）
# scp -r ./{Dockerfile,docker-compose.yml,Caddyfile,.dockerignore,src,public,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,scripts,next.config.ts,drizzle.config.ts} user@your-vps:/opt/nage/
```

### 3.2 生成强密钥

**必须**手动设置 `JWT_SECRET`（首次启动自动生成那种是开发用，部署到公网必须显式设置）：

```bash
# 生成 48 字节随机密钥
openssl rand -base64 48
```

记下输出值，下一步用。

### 3.3 写 `.env`

```bash
cp .env.local.example .env
nano .env
```

**生产 `.env` 至少要改这三行**（不要加任何注释、不要有空行）：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<一个强密码，至少 12 位>
JWT_SECRET=<上一步 openssl 输出的整串>
ACME_EMAIL=you@example.com
```

> `ADMIN_PASSWORD` 是第一次启动时自动建管理员用的。**首次启动后改密码**就去 Web 界面 "成员" 页面改管理员密码，或者删库重启用新密码。

### 3.4 启动

```bash
docker compose up -d --build
```

第一次会先 `pnpm install` + `pnpm build`（要 3-5 分钟），之后才起容器。

### 3.5 观察

```bash
# 实时日志
docker compose logs -f

# 只看 app
docker compose logs -f app

# 健康状态
docker compose ps
```

看到 `app` 状态是 `Up (healthy)`、`caddy` 状态是 `Up` 就差不多了。

Caddy 第一次启动会去申请证书，**日志里出现 `obtained certificate` 就说明 HTTPS 通了**。

### 3.6 首次登录

浏览器打开 `https://nage.example.com`，用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。

> 第一次登录后，**强烈建议**在 "用户菜单 → 修改密码" 把管理员密码改成一个方便记忆但足够强的。

---

## 4. 备份

### 4.1 手动备份

```bash
# 方式 A：在主机上跑（需要主机装 sqlite3）
sudo apt install -y sqlite3
cd /opt/nage
bash scripts/backup.sh

# 方式 B：进 app 容器跑
docker exec -it nage-app bash /app/scripts/backup.sh
```

输出会显示在 `backups/20260611-030000/nage.db` + `meta.txt`，SHA256 + 大小都记下来了。

### 4.2 定时备份（推荐）

```bash
mkdir -p /opt/nage/logs
crontab -e
```

把 `scripts/backup-cron.example` 里的那行粘进去（注意 `cd` 路径要改对）：

```cron
0 3 * * * cd /opt/nage && BACKUP_KEEP_DAYS=30 bash scripts/backup.sh >> /opt/nage/logs/backup.log 2>&1
```

> **注意**：crontab 跑的时候 `BACKUPS` volume 是在**容器内**。
> 主机看 `./backups/` 是空的（因为是命名 volume，不是 bind mount）。
> 想在主机直接看备份，把 compose 里的 `nage-backups` 改成 `./backups:/app/backups`（bind mount）。

### 4.3 备份拷出来

```bash
# 列出备份
docker exec nage-app ls /app/backups

# 单个备份拷到主机当前目录
docker cp nage-app:/app/backups/20260611-030000 ./20260611-030000

# 或者改 compose 用 bind mount 后直接 cp
```

> **强烈建议**：再 rsync 到异地（另一台 VPS / 阿里云 OSS / Backblaze B2）。单 VPS 挂了就什么都没了。

### 4.4 恢复

```bash
# 1. 停 app（重要：恢复时不能让 app 持有 DB 锁）
docker compose stop app

# 2. 看有哪些备份
docker exec nage-app ls /app/backups

# 3. 挑一个恢复
docker exec -it nage-app bash /app/scripts/restore.sh /app/backups/20260611-030000
# 它会让你输入 "yes" 确认，会自动备份当前 DB 到 pre-restore-* 目录

# 4. 启动 app
docker compose start app
```

---

## 5. 升级

### 5.1 自建镜像（推荐：本地 build）

```bash
cd /opt/nage
git pull   # 或 scp 新的代码
docker compose build app
docker compose up -d
# 旧的容器会被替换，volume 数据不变
```

### 5.2 用预构建镜像（如果推到 Docker Hub 了）

修改 `docker-compose.yml` 顶部的 `build:` 段，改成：

```yaml
app:
  image: yourname/nage:1.2.0   # 改成你的镜像
  # 删掉 build: 段
```

然后：

```bash
docker compose pull
docker compose up -d
```

### 5.3 升级失败回滚

```bash
docker compose down
# 切回旧代码 / 旧镜像
git checkout v1.1.0
docker compose build app
docker compose up -d
# DB 不会动（volume 里的 nage.db 是兼容的）
```

> **跨大版本升级**前，先备份一次：
> `bash scripts/backup.sh` → 看到 `done.` 再升级。

---

## 6. 常用运维命令

```bash
# 看运行状态
docker compose ps

# 看资源占用
docker stats nage-app nage-caddy

# 实时日志
docker compose logs -f --tail=100 app

# 备份前手动检查 DB
docker exec -it nage-app sqlite3 /app/data/nage.db "SELECT count(*) FROM users;"

# 进 app 容器 debug
docker exec -it nage-app sh

# 重启某个服务
docker compose restart app

# 停全部
docker compose down   # 不删 volume
docker compose down -v  # ⚠️ 删 volume，连备份一起没
```

---

## 7. 故障排查

### 7.1 访问 502 Bad Gateway

```bash
# app 容器没起或崩了
docker compose ps app
docker compose logs --tail=200 app
```

常见原因：
- `JWT_SECRET` 改了但没重启 → `docker compose restart app`
- 启动时打印 `ECONNREFUSED` → 端口冲突
- OOM 被 kill → `dmesg | grep -i oom`

### 7.2 证书申请失败

```bash
docker compose logs caddy | tail -50
```

常见原因：
- DNS 没解析到 VPS（`dig nage.example.com` 验证）
- 80 端口没开（云厂商安全组 + 系统防火墙）
- 域名刚注册不到 1 分钟（再等等）
- 用了国内 DNS 但 ACME 走了国际线路被墙（接 Cloudflare 中转）

### 7.3 DB 锁错误 `SQLITE_BUSY`

WAL 模式下并发写偶尔会撞。短期：等 1 秒重试；长期：把热点写操作合并，或者上独立 DB 容器。

```bash
# 看是不是有 lock
docker exec -it nage-app sh -c 'ls -la /app/data/'
# 看到 nage.db-wal / nage.db-shm 是正常的
```

### 7.4 磁盘满了

```bash
# 看 volume 占多少
docker system df -v

# 单独看 db / uploads / backups
du -sh /var/lib/docker/volumes/nage_*

# 清理旧备份
docker exec -it nage-app find /app/backups -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +

# 清理 dangling 镜像
docker image prune -f
```

### 7.5 改 `.env` 后没生效

容器启动时才读 `.env`。**改完必须重启**：

```bash
docker compose up -d   # 不会改的
docker compose restart app   # 仅重启 app
# 或者
docker compose up -d --force-recreate
```

---

## 8. 安全清单

部署完确认以下都做了：

- [ ] 管理员密码已改（`用户菜单 → 修改密码`）
- [ ] `JWT_SECRET` 至少 32 字节随机
- [ ] `.env` 权限是 `chmod 600`：`chmod 600 /opt/nage/.env`
- [ ] 定时备份已配（`crontab -l` 能看到）
- [ ] 备份异地拷贝（`rsync` 到 OSS / 另一台机器）
- [ ] 防火墙只开 22 / 80 / 443（其他口都关）
- [ ] SSH 改密钥登录 + 禁密码（`/etc/ssh/sshd_config`）
- [ ] 失败 5 次锁 10 分钟默认开启（已内置，不用动）

---

## 9. 卸载

```bash
cd /opt/nage
docker compose down -v   # 删容器 + 删 volume（含所有数据）
rm -rf /opt/nage
```
