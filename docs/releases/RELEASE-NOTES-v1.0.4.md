# v1.0.4 (2026-06-14) — 修复上传图片 404

v1.0.3 把 413 "Body exceeded 1 MB limit" 修了之后，第二个连环 bug 浮出来：**图片保存到磁盘了，但 Next.js 不服务**——浏览器看到的是破图（404）。

## 🐛 修了什么

### 根因

Next.js 16 (Turbopack) production server 启动时**一次性**扫 `public/` 建文件清单，**启动后新加的文件不服务**。

- 启动前就存在的文件（比如镜像里 `public/file.svg` 之类）→ 200 OK
- 启动后新加的文件（用户在 UI 里刚上传的）→ **404 Not Found**

E2E 测试覆盖不到的原因：

- 测试脚本走的是手动签 JWT 调 HTTP API，不经过这条「public/ 静态文件」路径
- dev 模式 (`next dev`) 没这个 bug
- 本地开发没事是因为 `next dev` 每次请求都去磁盘读，prod build + Turbopack 才暴露

### 修法

加一条 rewrite + 一个 catch-all Route Handler，每次请求都去磁盘读最新文件，**绕开启动扫描**：

```ts
// next.config.ts
async rewrites() {
  return [
    { source: "/uploads/:path*", destination: "/api/uploads/:path*" },
  ];
}
```

```ts
// src/app/api/uploads/[...path]/route.ts
// 读 public/uploads/<...path> 返回;带 ETag/Last-Modified,
// 文件被覆盖(idx 不变但内容变)浏览器能拿到新版
```

rewrite 优先级**在 public/ 静态文件之前**，所以 route handler 会接管所有 `/uploads/*` 请求，绕开 Turbopack 的启动扫描。

### 其它细节

- **不鉴权**：和 v1.0.3 之前的行为一致（proxy.ts 早就放行 /uploads/ 了），URL 里带 itemId + idx 等同弱鉴权，个人/内网用够
- **不重命名文件**：filename 仍是 `{idx}.jpg`（写在 `public/uploads/items/{itemId}/{idx}.jpg`），DB 存的 path 也不动，零数据迁移
- **ETag 跟 (size, mtime) 走**：图片被覆盖浏览器会拿新版（`If-None-Match` 命中 304 走正确路径，不重新下载）
- **path traversal 防住**：`/`、`..`、空段、含 `\0` 的段统统 404；`path.resolve` 后必须仍在 `UPLOADS_DIR` 内

## 📦 部署（已用 v1.0.3 的用户）

```bash
cd /opt/nage
git pull
docker compose build app
docker compose up -d
```

**不需要任何数据迁移**：
- volume 挂载不动（`nage-uploads` 还在 `/app/public/uploads`）
- 文件位置不动（仍是 `public/uploads/items/{id}/{idx}.jpg`）
- DB 里的 `path` 字段不动（仍是 `/uploads/items/...`）

升级后已上传的图片 URL 立即可访问（route handler 读得到），新上传的也立即可访问（绕开了扫描）。

## 🆕 新部署

跟 v1.0.3 完全一致，参考 [RELEASE-NOTES-v1.0.3.md](./RELEASE-NOTES-v1.0.3.md) 或 [DEPLOY.md](../../DEPLOY.md)。没有任何配置层面变化。

## ✨ 没变

- 物品数据格式 0 变化
- 数据库 schema 0 变化
- 反代配置 0 变化
- 镜像 tag 之外的所有功能 0 变化

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- E2E 脚本未受影响（HTTP API 路径不变）
- **手动验证**（推荐部署后做一次）：
  1. 登录 → 创建或编辑物品 → 上传 1 张图 → 保存
  2. 列表 / 详情页应该立即显示该图，DevTools Network 看到 `/uploads/items/<id>/<idx>.jpg` 返回 200 `image/jpeg`
  3. 再次编辑同一物品、用同一 idx 重新上传一张不同的图 → 保存后详情页应显示新图（ETag 变化，浏览器不读缓存）
  4. 删除该图 → 列表/详情应立即不再显示

## 🛣 下一步

- v1.1 计划不变：借出归还 / 保质期增强 / PWA / i18n
- 详见 [PRD.md §10](./PRD.md)

## 📄 许可

GPL v3
