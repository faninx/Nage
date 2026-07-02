# v1.4.1 (2026-07-02) — Docker standalone 依赖修复

v1.4.0 Docker 镜像在 self-hosted 部署场景下报告 `Cannot find module 'bindings'`（或 `'file-uri-to-path'`）的启动崩溃。3 个 commit 全部 fix 到此问题，**0 数据库 schema 变化，0 数据迁移**。

## 🐛 Bug 修复

### 1. `Cannot find module 'bindings'`

**症状**：`docker compose up` 起容器后应用启动失败，日志报：

```
Error: Cannot find module 'bindings'
Require stack:
- /app/node_modules/better-sqlite3/lib/index.js
```

**根因**：`better-sqlite3` 通过 `require('bindings')` 加载原生 `.node` 文件。`bindings` 是 better-sqlite3 的 transitive dep，**pnpm 默认不把 transitive deps hoist 到顶层 `node_modules/`**。

Next.js 16 的 `outputFileTracingIncludes` 用 `pnpm .pnpm/` 路径规则在 standalone output 里**不可靠**——standalone 把依赖平铺到 `.next/standalone/node_modules/`，但 `bindings` 仍在 `.pnpm/bindings@1.5.0/...` 路径下，`better-sqlite3` 解析不到。

`next.config.ts` 里给 `better-sqlite3` / `sharp` 加 `outputFileTracingIncludes` 能 work 是因为这两个是**直接依赖**、被 pnpm hoist 了；`bindings` 作为 transitive dep 不被 hoist，单独加规则无效。

**修复**：`Dockerfile` runtime 阶段显式 `COPY --from=deps /app/node_modules/.pnpm/bindings@* /app/node_modules/bindings`（commit `cf6bdc1`）。绕过 Next.js 的 tracing 限制。

### 2. `Cannot find module 'file-uri-to-path'`

**症状**：修了 #1 之后启动报：

```
Error: Cannot find module 'file-uri-to-path'
Require stack:
- /app/node_modules/bindings/bindings.js
```

**根因**：`file-uri-to-path` 是 `bindings` 的间接依赖（Windows 路径转换用）。`bindings` 被装上时 pnpm 会把 `file-uri-to-path` symlink 到 `node_modules/.pnpm/bindings@1.5.0/node_modules/file-uri-to-path`，但 standalone flat 结构里 pnpm 不会自动 hoist 这个 transitive。

commit `cf6bdc1` 的 message 里已经预测到「如果后续跑镜像报 'Cannot find module file-uri-to-path'，再加一行 COPY」，于是 `9872932` 加了第二行：

```dockerfile
COPY --from=deps /app/node_modules/.pnpm/file-uri-to-path@* /app/node_modules/file-uri-to-path
```

### 3. 撤回不生效的 `next.config.ts` 规则

`next.config.ts` 里给 `bindings` / `file-uri-to-path` 用 `.pnpm/` 路径规则的尝试**不生效**——standalone 输出的 `.next/standalone/node_modules/bindings/` 平铺后仍无法被 `better-sqlite3` 找到（commit `0272667`）。

撤回那段无用代码，留 `sharp` / `better-sqlite3` / `@img` 的规则（这些 work，因为是 direct deps 被 hoist）。

**正确的解**：Dockerfile runtime 阶段显式 COPY（不是 next.config.ts 改 tracing）。

## 📦 副作用

- Docker 镜像多 ~5KB（bindings + file-uri-to-path 两个小包）
- 0 schema 变化 / 0 数据迁移 / 0 API 变化 / 0 配置变化

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.1
docker compose pull
docker compose up -d
```

只换镜像，不需要动任何配置 / 数据库。

## 🧪 验证

```bash
docker build -t nage:1.4.1 .
docker run --rm -p 3000:3000 nage:1.4.1
# 启动日志应不再有 "Cannot find module 'bindings'" / "Cannot find module 'file-uri-to-path'"
```

CI 推送 tag `v1.4.1` 后自动构建并 push：
- `ghcr.io/faninx/nage:1.4.1`
- `faninx/nage:1.4.1`

## 📚 文档

- `CHANGELOG.md` — 1.4.1 段
- `Dockerfile` — runtime 阶段显式 COPY bindings + file-uri-to-path
- `next.config.ts` — 撤回 `.pnpm/` 路径规则

## 📊 变更

3 个 commit（自 v1.4.0 tag）：

| Commit | 类型 | 内容 |
|---|---|---|
| `cf6bdc1` | fix(docker) | Dockerfile runtime 显式 COPY bindings |
| `0272667` | refactor(next.config) | 撤回不生效的 `.pnpm/` 路径规则 |
| `9872932` | fix(docker) | Dockerfile 再补 COPY file-uri-to-path |