# v1.1.1 (2026-06-16) — Docker 镜像瘦身

v1.1.0 让 Nage 升级成"小团队 / 家庭多人协作"了，但 Docker 镜像也吃到了 ~650MB——大部分是 `node_modules`（~656MB 即便 `pnpm prune --prod` 也只能剪到 ~200MB）+ 全量 `.next/`。v1.1.1 用 Next.js 的 `output: "standalone"` 模式做一次纯构建侧瘦身，**功能 0 变化**，只让镜像从 650MB 降到 510MB（-22%）。

## 🔧 变更

### `output: "standalone"` 模式

- `next.config.ts` 加 `output: "standalone"` + `outputFileTracingIncludes: { "/": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*", "./node_modules/better-sqlite3/**/*", "./node_modules/bindings/**/*"] }`
- **必须配 `outputFileTracingIncludes`** 的原因：Next.js 静态分析追踪不到 native binding（sharp / better-sqlite3 的 `.node` 二进制），不显式声明启动会报"cannot find module"
- standalone 产物包含：`server.js` + 最小 `node_modules`（~106MB：next 17M + sharp 二进制 33M + better-sqlite3 13M + drizzle-orm 13M + react-dom 1.3M）+ `.next/`
- **不包含**：`.next/static`（客户端 chunks / CSS / 图片）/ `public/` / `drizzle/` / `scripts/`——这些 runtime 阶段要单独 `COPY`

### Dockerfile 调整

- **builder 阶段**：去掉 `pnpm prune --prod`（standalone 自带最小集，原 `node_modules` 在 builder 用完即弃）
- **runtime 阶段**：

  ```dockerfile
  COPY --from=builder --chown=nage:nage /app/.next/standalone ./
  COPY --from=builder --chown=nage:nage /app/.next/static ./.next/static
  COPY --from=builder --chown=nage:nage /app/public ./public
  COPY --from=builder --chown=nage:nage /app/scripts ./scripts
  COPY --from=builder --chown=nage:nage /app/drizzle ./drizzle
  ```

- **入口**：`CMD ["node", "server.js"]`（不再是 `next start`）
- **tini / non-root / HEALTHCHECK 都不变**

### corepack 走 npmmirror

- corepack 默认从 `registry.npmjs.org` 拉 pnpm 元数据，国内网络经常 timeout
- 加 `ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com` 到 deps + builder 阶段
- 国外 CI 走默认 `registry.npmjs.org` 也没副作用（这条 env 只在 Dockerfile 内生效，不影响构建产物）

### 遗留文档修正

- `docs/releases/RELEASE-NOTES-v1.0.{0,1,2,3,4}.md` 内的相对路径从 `./` 改成 `../..//`——v1.1.0 移到 `docs/releases/` 时漏改，相对路径全断

## 📦 镜像大小对比

| 镜像 | 大小 | 说明 |
|---|---|---|
| v1.1.0 旧版 | ~650MB | node_modules ~200MB（prune 后）+ 全量 .next + src |
| **v1.1.1 standalone** | **510MB** | base 390MB + standalone 117MB + static 2MB |

> Layer 分解（v1.1.1）：Debian + Node 24 base = 390MB / `.next/standalone` = 117MB / `.next/static` = 2MB / 杂项 ~1MB

## ✨ 没变

- 物品 / 位置 / 分类 / 标签 / 空间 / 成员 字段和操作 0 变化
- 反代配置 0 变化
- 数据库 schema 0 变化
- E2E 测试全部还在（`scripts/test-http.ts` / `test-crud.ts` / `test-flow.ts` / `test-items.ts` / `test-m7-multiuser.ts`）
- 启动 / 备份 / 恢复脚本 0 变化

## 🧪 验证

- 本地 `docker build -t nage-test .` 跑通，镜像 510MB
- 本地 `docker run -d nage-test` 冒烟：Next.js ready + 9 张表全建 + admin 账号创建 + `/login` 200
- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过（standalone 模式下）
- 升级到 v1.1.1 后无任何数据迁移需要

## 📦 升级指引

**源码用户**：

```bash
cd /opt/nage
git pull
git checkout v1.1.1
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 不会跑任何新迁移（v1.1.0 的 `0003_flimsy_orphan` 已跑过）。

**ghcr.io / Docker Hub 镜像用户**：

```bash
# 编辑 docker-compose.yml，把 image 改成 :1.1.1
docker compose pull
docker compose up -d
```

## 🚀 新部署

跟 v1.1.0 完全一致，参考 [DEPLOY.md](../../DEPLOY.md)。无配置层面变化。启动后会自动建管理员 + 自动跑迁移（v1.1.0 已跑过，v1.1.1 无新迁移）。

## 🛣 下一步（v1.2 计划）

- 借出 / 归还流程（F13）
- 保质期增强：仪表盘「快过期」分组卡片（F14 收口）
- PWA 离线（F16）
- 多语言 i18n（F18）

## 📄 许可

GPL v3
