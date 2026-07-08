# v1.4.4 (2026-07-08) — UX 修复 + 安全响应头

v1.4.3 后的两个小 fix 合集。**0 数据库 schema 变化，0 数据迁移**。

## 🐛 Bug 修复

### 1. 删除空间弹两次确认窗（UX 缺陷）

**症状**：在 `/spaces/<id>/settings` 点"删除此空间"，弹两个连续确认窗（外层 `<Dialog>` + 内层 `useConfirm()`），用户要点 2 次确认才真正删。

**根因**：删除按钮外层包了 `<Dialog>` 弹窗，里面"确认删除"按钮再调 `handleDeleteSpace` → `handleDeleteSpace` 内部又调 `confirm({...})` 弹第二次。外层 Dialog 完全是冗余。

**修复**（commit `4e3a309`）：去掉外层 Dialog，按钮直接 `onClick={handleDeleteSpace}`，由内层 `confirm({...})` 弹一次。跟同文件 `handleRemove`（移除成员）的模式保持一致。顺便清掉不再用的 `deleteOpen` state。

### 2. 安全响应头全缺 + uploads 路由允许 SVG + MCP server version 跟实际不符

#### 2a. 6 个安全响应头全缺（next.config.ts）

**症状**：安全扫描工具发现所有页面响应头缺以下字段：
- `Content-Security-Policy`（CSP）
- `Strict-Transport-Security`（HSTS）
- `X-Frame-Options`
- `X-Content-Type-Options`（nosniff）
- `Referrer-Policy`
- `Permissions-Policy`

**修复**（commit `c4b994b`）：`next.config.ts` 加 `headers()`，按 Nage 实际用法开 CSP（`'self'` + `'unsafe-inline'` for next-themes 防 FOUC 内联脚本 + `img-src 'self' data: blob:` for sharp 处理后的 next/image 缩略图），HSTS 设 1y（dev HTTP 浏览器自动忽略），其他按基线值。`/api/uploads/*` 单独覆盖 `default-src 'none'` CSP（defense-in-depth）。

#### 2b. uploads 路由 MIME 白名单含 `.svg`

**症状**：`/api/uploads/[...path]` 的 MIME map 包含 `.svg → image/svg+xml`。SVG 可内嵌 `<script>`，浏览器渲染时执行 JS，构成 stored-XSS。

**根因**：Nage 上传管线走 sharp 转 jpg，**用户上传的 SVG 走不进流程**（sharp 会抛错），但 MIME 白名单允许是 defense-in-depth 漏洞——万一 `.svg` 通过手工放置或未来新特性进 `data/uploads/`，会被 route handler 当图服务。

**修复**（commit `c4b994b`）：从 MIME map 删 `.svg`。未在白名单的扩展名回落到 `application/octet-stream`，浏览器不会当 SVG 渲染。

#### 2c. MCP SERVER_VERSION 跟 package.json 不符

**症状**：MCP server info 报的版本是 `"1.2.1"`（源码硬编码），跟实际 `package.json` 的 `1.4.3` 不符——安全工具扫到这个不一致会标 issue。

**修复**（commit `c4b994b`）：改成 `import pkg from '../../../package.json'` 动态读 `pkg.version`（跟 `src/app/(app)/layout.tsx` 的 `APP_VERSION` 同款模式），从此发版不会再漏 bump。

## 📦 副作用

- 0 schema 变化 / 0 数据迁移 / 0 API 变化 / 0 配置变化
- 响应头会变大约 1 KB per request（gzip 后忽略不计）
- CSP `'unsafe-inline'` 是过渡方案——Next 16 nonce 模式稳定后切

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.4
docker compose pull
docker compose up -d
```

只换镜像，0 配置变化。

## 🧪 验证

```bash
# 启动后 curl 响应头，确认 6 个都在
curl -sI https://nage.example.com/login | grep -iE "content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy"

# uploads 路由 SVG 不再被服务（404 或 octet-stream）
curl -sI https://nage.example.com/uploads/items/1/test.svg
# 应该看到 Content-Type: application/octet-stream 或 404

# MCP server info 报 v1.4.4
curl -s -X POST https://nage.example.com/api/mcp \
  -H "Authorization: Bearer nage_mcp_xxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' | jq .result.serverInfo.version
# "1.4.4"

# 删除空间只弹一次窗
# 浏览器 → 空间设置 → 删除此空间 → 应该看到一个确认框（不是两个）
```

CI 推送 tag `v1.4.4` 后自动构建并 push：
- `ghcr.io/faninx/nage:1.4.4`
- `faninx/nage:1.4.4`

## 📚 文档

- `CHANGELOG.md` — 1.4.4 段
- `docs/releases/RELEASE-NOTES-v1.4.4.md` — 本文件

## 📊 变更

2 个 commit（自 v1.4.3 tag）：

| Commit | 类型 | 内容 |
|---|---|---|
| `4e3a309` | fix(ux) | 删除空间去重弹窗（外层 Dialog 是冗余） |
| `c4b994b` | fix(security) | 6 个安全响应头 + uploads 拒 SVG + MCP version 跟 package.json 同步 |