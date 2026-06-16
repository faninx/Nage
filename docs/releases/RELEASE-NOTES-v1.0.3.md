# v1.0.3 (2026-06-14) — 修复上传图片 413

紧急 bug fix 版本，处理 v1.0.2 起的用户报告：**Nage 反代到 Nginx/Caddy/Cloudflare 后，上传图片报 "Body exceeded 1 MB limit"**（HTTP 413），无法保存物品。

## 🐛 修了什么

### 根因

Next.js 16 的 Server Action 默认请求体上限是 **1MB**。手机原图单张就 3-5MB，加上 FormData 包装、其它字段、React 内置 rsc payload，**必然超**。v1.0.0 起就一直有这个问题，但本地开发用 `next dev` 直连 `localhost:3000` 时表现不明显（开发模式有别），公网反代一上来就崩。

### 修法

`next.config.ts` 加 `experimental.serverActions.bodySizeLimit: "20mb"`，跟反代示例的 `client_max_body_size 20M` 对齐。

```ts
// next.config.ts
export default {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};
```

`20mb` 的来源：

- 1 张原图 ≤ `MAX_IMAGE_BYTES`（10MB）
- 1 个物品 ≤ `MAX_IMAGES_PER_ITEM`（9 张）= 90MB 理论上限
- **实际不会撞**：sharp 压缩前已经在客户端 / 浏览器内做了一次 resize 准备（File 还在浏览器里），FormData 里的 JPEG 上传时已经 ≤ 几 MB
- `20mb` 留足余量（9 张 × 2MB ≈ 18MB），又比 Next.js 默认 `1mb` 宽 20 倍
- 一次想传更多图（>10MB 单张 / >9 张）：把 `next.config.ts` 的 `bodySizeLimit` 和反代的 `client_max_body_size` 同时调大即可，**两边必须一起改**，否则会撞另一边

### 为什么没在 v1.0.0 收口时发现

v1.0.0 写 `DEPLOY.md` 的时候**没意识到 Next.js 16 Server Action 改了 body limit**（Next 15 之前没这个 1MB 硬性限制）。本地 `next dev` 测上传看起来没事，**是因为 dev 模式 + 直连 3000 时根本不经过这个 1MB 闸门**——只有 production build + 真正的反代转发才会触发。公网用户首次部署就立刻撞到，反馈上来才意识到。

E2E 测试脚本（`test-http.ts` / `test-crud.ts` 等）走的是手写 JWT 调 HTTP API，**不经过 Server Action**，所以全部 63 个用例都过——这也是为什么 v1.0.0 / v1.0.1 / v1.0.2 都没暴露。

## 📦 部署（已用 v1.0.2 的用户）

### 镜像用户

```bash
cd /opt/nage
# 编辑 docker-compose.yml,把 image tag 从 :1.0.2 改成 :1.0.3
nano docker-compose.yml
docker compose pull
docker compose up -d
```

### 源码用户

```bash
cd /opt/nage
git pull
docker compose build app   # 必须 rebuild,改的是 next.config.ts
docker compose up -d
```

### 不升级的临时绕过（不推荐）

如果你不想等 rebuild，**手动**改 `next.config.ts` 加 `bodySizeLimit: "20mb"`，然后自己 `docker compose build app`。下次正式升级时这个改动会被覆盖，不影响，但何必呢。

## 🆕 新部署

跟 v1.0.2 完全一致，参考 [RELEASE-NOTES-v1.0.2.md](./RELEASE-NOTES-v1.0.2.md) 或 [DEPLOY.md](../../DEPLOY.md)。**没有任何配置层面变化**——这一版就是 next.config.ts 加一行 + 三份反代示例各加一段注释。

## ✨ 没变

- 物品数据格式 0 变化
- 数据库 schema 0 变化
- 反代配置 0 变化（Caddy v2 / Cloudflare Tunnel 默认就不限 body size，Nginx 用户本来就已经 `client_max_body_size 20M`）
- 镜像 tag 之外的所有功能 0 变化

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` 全过
- `pnpm build` 全过
- E2E 脚本未受影响（HTTP API 路径不变）
- **手动验证**（推荐部署后做一次）：登录 → 进任一物品编辑 → 上传 1 张 ≥ 2MB 的图 → 保存 → 应该成功且不报 413

## 🛣 下一步

- v1.1 计划不变：借出归还 / 保质期增强 / PWA / i18n
- 详见 [PRD.md §10](./PRD.md)

## 📄 许可

GPL v3
