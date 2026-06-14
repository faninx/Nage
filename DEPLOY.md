# 纳格（Nage）部署文档

> 目标读者：想把这套系统部署到公网 VPS 的管理员。
>
> 范围：单 VPS + Docker Compose，**反代由你自己解决**（Caddy / Nginx / Cloudflare Tunnel 任选）。
>
> 预计耗时：第一次 30-60 分钟，主要是 DNS 解析和反代配证书。

---

## 0. 架构总览

```
[ 用户浏览器 ]
      │ HTTPS (443)
      ▼
┌──────────────┐
│  反代         │  ← 你自己架（Caddy / Nginx / Cloudflare Tunnel 任选）
│  (你维护)    │     自动申请 / 续期 Let's Encrypt 证书
└──────┬───────┘
       │ HTTP (3000，主机 / 容器网络)
       ▼
┌──────────────┐
│  nage-app    │  ← Next.js 16 + Node 24（docker compose 管）
│  容器        │
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

---

## 1. 准备 VPS

### 1.1 推荐配置

- 1 vCPU / 1GB RAM 起步（2GB 留点余量）
- 系统：Ubuntu 24.04 LTS 或 Debian 12（bookworm）
- 公网 IPv4
- 域名（备案与否取决于你用谁做反代 —— Cloudflare 边缘可绕开部分限制）

### 1.2 防火墙放行

| 端口 | 用途 |
|------|------|
| `22` | SSH |
| `80` | 反代申请 / 续期 ACME 证书（用 Cloudflare Tunnel 则不需要） |
| `443` | HTTPS |

如果用云厂商安全组（AWS SG / 阿里云 ECS 安全组 / 腾讯云 CVM 安全组），**也要**放行这些。

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

**等 5-10 分钟让 DNS 生效**再继续。反代申请证书时必须能解析到这台机器。

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
git clone https://github.com/faninx/Nage.git .

# 方式 B：scp 上传（开发机执行）
# scp -r ./{Dockerfile,docker-compose.yml,.dockerignore,src,public,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,scripts,next.config.ts,drizzle.config.ts,.env.local.example} user@your-vps:/opt/nage/
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
```

**反代后还必须加一行**（给二维码用）：

```env
PUBLIC_URL=https://nage.example.com
```

不带路径、不带尾部斜杠；非默认端口就加 `:8443`。`https://nage.example.com` 和 `https://nage.example.com/` 都能识别。

> `ADMIN_PASSWORD` 是第一次启动时自动建管理员用的。**首次启动后改密码**就去 Web 界面 "成员" 页面改管理员密码，或者删库重启用新密码。
>
> `PUBLIC_URL` 不填的话启动时会打警告,二维码会指向 `localhost`（扫码全废）。内网裸跑不设也行。
>
> v1.0.1 起不再需要 `ACME_EMAIL`（Caddy 已不集成，反代自己管证书）。

### 3.4 启动 Nage

```bash
docker compose up -d --build
```

第一次会先 `pnpm install` + `pnpm build`（要 3-5 分钟），之后才起容器。

### 3.5 观察

```bash
# 实时日志
docker compose logs -f

# 健康状态
docker compose ps
```

看到 `app` 状态是 `Up (healthy)` 就说明 Nage 本身起来了。

**直接访问验证**（绕过反代）：

```bash
curl -I http://127.0.0.1:3000/login
# 期望：HTTP/1.1 200
```

> `APP_PORT`（默认 3000）控制三件事：compose 主机端口映射、容器端口、应用监听端口。改成 8080 就在 `.env` 里加 `APP_PORT=8080` 再 `docker compose up -d`，反代配置里 `127.0.0.1:3000` 也对应改成 `127.0.0.1:8080`。

这一步通了再架反代。

### 3.6 架反代（关键步骤）

挑一个方案，按对应文档配：

| 方案 | 文档 | 一句话特点 |
|------|------|-----------|
| Caddy | [docs/examples/caddy/](./docs/examples/caddy/) | 配置最少，自动 HTTPS |
| Nginx | [docs/examples/nginx/](./docs/examples/nginx/) | 用的人最多，文档全 |
| Cloudflare Tunnel | [docs/examples/cloudflare-tunnel/](./docs/examples/cloudflare-tunnel/) | 不需主机开 80/443 |

所有方案的共同前提：

- Nage 已经 `Up (healthy)`
- `http://127.0.0.1:3000` 能访问
- 域名 DNS 已解析到主机 IP

### 3.7 首次登录

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

### 5.2 用预构建镜像（从 ghcr.io）

修改 `docker-compose.yml` 顶部的 `app` service，把 `build:` 段删掉，`image:` 改成：

```yaml
app:
  image: ghcr.io/faninx/nage:1.0.4   # 改成你想用的版本
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
git checkout v1.0.0
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
docker stats nage-app

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

### 7.1 访问 502 Bad Gateway / 反代连不上

```bash
# 1. Nage 本身是否健康
docker compose ps app
docker compose logs --tail=200 app

# 2. 主机能否直连 Nage
curl -I http://127.0.0.1:3000/login
# 不通 → Nage 没起来或崩了，回去查 7.0
# 通 → 反代配置错了，回去查反代文档
```

常见原因：

- `JWT_SECRET` 改了但没重启 → `docker compose restart app`
- 启动时打印 `ECONNREFUSED` → 端口冲突
- OOM 被 kill → `dmesg | grep -i oom`

### 7.2 反代申请不到证书

查反代自己的日志：

| 反代 | 日志位置 |
|------|---------|
| Caddy（主机） | `journalctl -u caddy -f` |
| Caddy（容器） | `docker compose logs -f caddy` |
| Nginx + Certbot | `sudo certbot renew --dry-run` 和 `journalctl -u nginx` |
| Cloudflare Tunnel | `cloudflared tunnel info nage` |

常见原因：

- DNS 没解析到 VPS（`dig nage.example.com` 验证）
- 80 端口没开（云厂商安全组 + 系统防火墙）
- 域名刚注册不到 1 分钟（再等等）
- 用了国内 DNS 但 ACME 走了国际线路被墙（接 Cloudflare 中转，或直接用 Cloudflare Tunnel）

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

### 7.6 上传图片报 "Body exceeded 1 MB limit" / 413

`app` 容器日志看到 `Error: Body exceeded 1 MB limit`，浏览器这边就是 413 Payload Too Large。

**根因**：Next.js 16 的 Server Action 默认请求体上限是 1MB，**单张手机原图就超了**。Nage 在 v1.0.3 起把 `next.config.ts` 里的 `experimental.serverActions.bodySizeLimit` 调到了 `20mb`（对齐反代的 `client_max_body_size 20M`），所以拉新镜像就不会再撞。

如果用的是 v1.0.2 及更早的镜像，又不想升级（升级后还要 `rebuild` 一次镜像，嫌麻烦），可以临时绕过：

```bash
# 1. 改 next.config.ts：experimental.serverActions.bodySizeLimit: "20mb"
# 2. 重新 build
cd /opt/nage
docker compose build app
docker compose up -d
```

如果想继续传更大的图（批量、4K 摄影之类），把 `next.config.ts` 的 `20mb` 和反代示例的 `client_max_body_size 20M` / 各自 `body_size` 限制都对应调大。**应用层 `MAX_IMAGE_BYTES`（单张 10MB）和 `MAX_IMAGES_PER_ITEM`（单物品 9 张）仍会先兜底校验**——放大上传上限主要是为了多张图的合计体积。

常见反代默认上限（够用就是没动它）：

| 反代 | 默认 body 上限 | 配置项 | 备注 |
|------|---------------|--------|------|
| Nginx | `1m` | `client_max_body_size` | **必须**显式改成 `20M` 以上 |
| Caddy v2 | 无限制 | —— | 直接交给上游 Next.js |
| Cloudflare Tunnel | 免费版 100MB / 单文件 | —— | 默认就够 9 张图 |

### 7.7 上传图片保存后 404 / 一直是旧图

物品详情 / 列表里图片是破的，浏览器 DevTools 看到 `/uploads/items/<id>/<idx>.jpg` 返回 404，但 `docker exec nage-app ls /app/public/uploads/items/<id>/` 明明能看见文件。

**根因**：Next.js 16 (Turbopack) production server 启动时**一次性**扫 `public/` 建文件清单，**启动后新加的文件不被服务**。这是 Next.js 16 + Turbopack 的已知行为（dev 模式没问题，prod 才暴露）。E2E 脚本不走这条路径所以一直没测出来。

**修法**：v1.0.4 起加了 `/uploads/:path*` → `/api/uploads/:path*` 的 rewrite + 一个 catch-all Route Handler，每次请求都去磁盘读，绕开启动扫描。

```bash
cd /opt/nage
git pull
docker compose build app
docker compose up -d
# 不用动 volume,不用动 DB
```

不升级的话**没有干净绕过**——只要 prod server 还在跑，新上传的文件就 404。改 `next.config.ts` 加 rewrite 同样要 rebuild，等于升级。直接拉 v1.0.4 镜像最省事。

类似症状（修改后图片缓存不刷新）：v1.0.4 的 route handler 用 ETag（size + mtime 哈希），文件被覆盖浏览器会拿到新版（304 走正确路径）。如果你看到旧的图，清一下浏览器缓存或硬刷新（Ctrl+Shift+R）。

---

## 8. 安全清单

部署完确认以下都做了：

- [ ] HTTPS 通了（浏览器地址栏锁 + 证书有效）
- [ ] 管理员密码已改（`用户菜单 → 修改密码`）
- [ ] `JWT_SECRET` 至少 32 字节随机
- [ ] `.env` 权限是 `chmod 600`：`chmod 600 /opt/nage/.env`
- [ ] 定时备份已配（`crontab -l` 能看到）
- [ ] 备份异地拷贝（`rsync` 到 OSS / 另一台机器）
- [ ] 防火墙只开 22 / 80 / 443（其他口都关；用 Cloudflare Tunnel 则 80/443 也可关）
- [ ] SSH 改密钥登录 + 禁密码（`/etc/ssh/sshd_config`）
- [ ] 失败 5 次锁 10 分钟默认开启（已内置，不用动）

---

## 9. 卸载

```bash
cd /opt/nage
docker compose down -v   # 删容器 + 删 volume（含所有数据）
rm -rf /opt/nage
```