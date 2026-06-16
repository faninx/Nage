# v1.0.1 (2026-06-14) — 移除 Caddy 集成

小补丁版本，主要改动是部署侧：v1.0.0 把 Caddy 集成进 `docker-compose.yml`，v1.0.1 起反代由你自己解决。

## 🔧 变更

- **移除 Caddy**：`docker-compose.yml` 只剩 `app` service，根目录 `Caddyfile` 删除
- **新增反代示例**：[`docs/examples/`](./docs/examples/) 下三个方案：
  - [Caddy](./docs/examples/caddy/) — 配置最少，自动 HTTPS
  - [Nginx](./docs/examples/nginx/) — 用的人最多，文档全
  - [Cloudflare Tunnel](./docs/examples/cloudflare-tunnel/) — 不需要主机开 80/443
- **端口可配置**：新 `APP_PORT` 环境变量贯通 compose 端口映射 + 应用监听,默认 3000
- **移动端底部 Tab**：从 4 个变 5 个(首页 / 物品 / 位置 / 分类 / 标签)
- **Docker build 切 USTC 镜像源**:`apt-get update` 速度 27 KiB/s → 5.9 MB/s。默认 `ARG APT_MIRROR=mirrors.ustc.edu.cn`,国外回退用 `--build-arg APT_MIRROR=deb.debian.org`
- **QR 二维码用 PUBLIC_URL**:反代后扫码直达,不再指向 `localhost`。`.env` 加 `PUBLIC_URL=https://你的域名` 即可(兼容端口和尾部斜杠)
- **修 v1.0.0 文档坑**：`.env.local.example` 之前缺 `ACME_EMAIL`，按模板部署会 fail，现在统一清理掉

## 📦 部署（已用 v1.0.0 的用户）

```bash
cd /opt/nage
git pull
docker compose up -d
```

如果你之前在用 compose 集成的 Caddy：

1. 你自己之前装的反代(Nginx / Cloudflare Tunnel / 主机 Caddy)继续跑就行
2. `compose` 升级后只剩 `nage-app` 容器
3. 如果反代之前指向 `nage-app:3000`(Docker 网络),改成 `127.0.0.1:3000`（app 现在直接 ports 绑定主机）

如果你之前直接用裸反代（没跑过 compose 里的 caddy service）：什么都不用做，新 compose 等价。

## 🆕 新部署

```bash
git clone https://github.com/faninx/Nage.git
cd Nage
cp .env.local.example .env   # 改 ADMIN_PASSWORD / JWT_SECRET
docker compose up -d --build
# 验证
curl -I http://127.0.0.1:3000/login   # 期望 200
# 然后按 docs/examples/ 里任选一个反代方案配
```

## 🐛 修

- `.env.local.example` 引用了不存在的 `ACME_EMAIL`(`docker-compose.yml` 模板有,env 模板没有) — v1.0.0 用户按文档部署会 fail,现在清理

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- E2E 脚本不受影响(Caddy 集成是部署侧,与运行时无关)
- 本地手测:`docker compose up -d` 起 Nage,`curl http://127.0.0.1:3000/login` 返回 200

## 📋 文档

- [DEPLOY.md](../../DEPLOY.md) — 已重写,新增"架反代"章节
- [docs/examples/](../../docs/examples/) — 反代配置示例(Caddy / Nginx / Cloudflare Tunnel)
- [CHANGELOG.md](../../CHANGELOG.md) — 完整变更

## 🛣 下一步

- v1.1:借出归还 / 保质期增强 / PWA
- 详情见 [PRD.md §10](../../PRD.md)

## 📄 许可

GPL v3