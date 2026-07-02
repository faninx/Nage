# v1.4.3 (2026-07-03) — Docker standalone 依赖修复合集

v1.4.2 后用户部署报告的 Docker standalone 启动崩溃系列 bug，全部 fix 在这一版。**主题相关还有一个 next-themes 改造也合进来**。**0 数据库 schema 变化，0 数据迁移**。

## 🐛 Bug 修复

### 1. Docker 容器启动报 `Cannot find module 'bindings'`

**症状**：v1.4.1 / v1.4.2 镜像启动失败，better-sqlite3 加载 native binding 时报 `Cannot find module 'bindings'`。

**根因**：`bindings` 是 better-sqlite3 的 transitive dep，**pnpm 默认不把 transitive deps hoist 到顶层 `node_modules/`**。`next.config.ts` 的 `outputFileTracingIncludes` 用 pnpm `.pnpm/` 路径对 standalone flat 结构**不可靠**——standalone 把依赖平铺到 `.next/standalone/node_modules/`，但 `bindings` 仍在 `.pnpm/bindings@1.5.0/...` 路径下，better-sqlite3 解析不到。

**修复**（commit `80227ee`）：Dockerfile runtime 阶段显式 `COPY --from=deps /app/node_modules/bindings ./node_modules/bindings`。

### 2. Docker 容器启动报 `Cannot find module 'file-uri-to-path'`

**症状**：修了 #1 之后启动报 `Cannot find module 'file-uri-to-path'`（`bindings` 的间接依赖，做 Windows 路径转换用）。

**根因**：`file-uri-to-path` 也是 `bindings` 的 transitive，pnpm 不 hoist。`bindings` 被装上时 pnpm 会把 `file-uri-to-path` symlink 到 `.pnpm/bindings@1.5.0/node_modules/file-uri-to-path/`，但 standalone flat 结构里不会自动 hoist。

**修复**（commit `80227ee` 同 commit，验证时追加）：从 `.pnpm/bindings@*/node_modules/file-uri-to-path/` 取——这是依赖路径里一定存在的位置。

### 3. 访问 `/settings/mcp` 等用 sharp 的页面报 `Cannot find module 'detect-libc'`

**症状**：登录后切换空间、访问 MCP 设置等触发 sharp 图片处理的页面，崩 `Cannot find module 'detect-libc'`。

**根因**：`detect-libc` 是 sharp 的 transitive dep，pnpm 不 hoist → standalone 找不到。

**修复**（commit `9581d8d`）：Dockerfile runtime 阶段 `COPY .pnpm/detect-libc@*/node_modules/detect-libc ./node_modules/detect-libc`。

### 4. sharp 加载报 `Cannot find module 'semver/functions/coerce'`

**症状**：修了 #3 之后 sharp 启动报 `Cannot find module 'semver/functions/coerce'`（sub-path require）。

**根因**：`sharp/lib/libvips.js` 走的是 sub-path require（`require('semver/functions/coerce')` / `require('semver/functions/gte')` / `require('semver/functions/satisfies')`），`semver` 也是 sharp 的 transitive dep。

**修复**（commit `9581d8d`）：Dockerfile runtime 阶段 `COPY .pnpm/semver@7.8.3/node_modules/semver ./node_modules/semver`（sharp 用的版本）。

**附带经验**（MEMORY 记）：grep 查 transitive deps 时不能只看 `require('xxx')`，sub-path 形式（`require('xxx/yyy')`）要单独查，否则漏。

### 5. 平台装错导致 `Could not load sharp module using linux-x64 runtime`

**症状**：容器启动报 `Could not load the "sharp" module using the linux-x64 runtime` —— sharp 的 native binary（`@img/sharp-linux-x64`）缺失。

**根因 1**：sharp 的 native binary 在独立 `@img/sharp-linux-x64` optional dep 里。如果 `pnpm-lock.yaml` 是在 Windows / macOS host 上生成的，**frozen-lockfile 严格按 lockfile 装**，会装 `@img/sharp-win32-x64` 等其他平台的 binary。

**修复 1**（commit `c018bf7`）：
- deps 阶段 `ENV npm_config_target_platform=linux npm_config_target_cpu=x64` 强制 pnpm 装 Linux x64
- **drop `--frozen-lockfile`**——让 pnpm 根据 platform 重 resolve optional deps（lockfile 是 host 生成的，不 drop 改不动）

**根因 2**：即使 pnpm 装了 Linux binary，pnpm 不把 optional dep hoist 到顶层 `node_modules/@img/`。`@img/sharp-linux-x64` 装在 `.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/`，不是顶层。`next.config.ts` 的 `./node_modules/@img/**/*` tracing 规则在顶层匹配不到 → standalone 漏掉。

**修复 2**（commit `f05d415`）：Dockerfile runtime 阶段 `COPY .pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64 ./node_modules/@img/sharp-linux-x64`。

### 6. sharp 启动报 `libvips-cpp.so.8.17.3: cannot open shared object file`

**症状**：修了 #5 之后 sharp 启动报 `libvips-cpp.so.8.17.3: cannot open shared object file: No such file or directory`。

**根因**：sharp 的 `.node` 启动时是 **native 层 dlopen**（JS 看不到！），它会 dlopen libvips 的 .so（`libvips-cpp.so.8.17.3` 等）。这些 .so 在 `@img/sharp-libvips-linux-x64/lib/` 下，COPY 出来放在 node_modules 里 dlopen 也不会搜（默认不搜那里）。

**修复**（commit `0101732`）：COPY `.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/.` 到 `/usr/lib/x86_64-linux-gnu/`（debian 系统 lib 目录，动态链接器默认搜这里）。比设 `LD_LIBRARY_PATH` 干净。包是 self-contained（glib/expat 等依赖静态链），不用单独 `apt install libvips`。

**关键经验**（MEMORY 记）：sharp 的 `.node` 启动时是 native 层 dlopen，**在 JS 看不到**。光看 `require('@img/...')` 找不全 transitive native deps。要看实际 dlopen 哪些 .so 文件（strace / ldd），不能只看 JS require。

### 7. PC 浏览器刷新后暗黑模式跳回 light（item 详情 / members 列表尤其明显）

**症状**：设了暗黑模式后，刷新物品详情页 / 成员列表页 → 整页跳回 light。其他页面大部分正常或只是闪一下。

**根因**：之前手写 `ThemeScript`（`<body>` 里 inline script）防 FOUC。理论上同步 inline script 仍该在 children 解析前执行，但 React 19 + Next.js 16 在某些页面（item detail 用 `react-day-picker`、members 多个 `useActionState`）的 `<html>` RSC hydration 时序会重新设 className，把 script 加的 `.dark` 覆盖掉。**手写防 FOUC 不可靠**。

**修复**（commit `a0b7b63`）：改用 `next-themes` `ThemeProvider` 替代手写 `ThemeScript`。
- next-themes 自带 canonical FOUC 脚本，维护者会跟 React / Next 同步修 edge case
- `storageKey="nage-theme"` 沿用旧 key，**用户 localStorage 选择不丢**
- `attribute="class"` 跟 Tailwind v4 `@custom-variant dark` 兼容
- **顺手发现 sonner.tsx 一直在用 `useTheme()` 但没 provider**，一直拿 undefined 靠默认 'system' 兜住——改 Provider 后 sonner 终于能拿到真主题

### 8. 物品详情页切换空间后页面仍保持原 item

**症状**：在物品详情页 `/items/[id]` 点切换空间，空间的 `last_space_id` 切换了，但页面 URL 还在原 item 详情——新空间没有这个 ID / 无权限就 404。

**修复**（commit `4c9d19b`）：`SpaceSwitcher` 用 `usePathname()` 判断当前是否在 `/items/[id]`，是的话切完空间 `router.push('/items')`；其他页面保持 `router.refresh()` 行为。

为什么不限其他 per-resource 页面：`/locations/[id]` / `/categories/[id]` / `/tags/[id]` 这些详情都是 modal（在 list 里打开），没有独立路由。`/admin/members` / `/admin/data` 切空间后行为合理（自然显示新空间数据），不需要重定向。

## 📦 副作用

- 0 schema 变化 / 0 数据迁移 / 0 API 变化 / 0 配置变化
- Docker 镜像大小：sharp 相关的几个包加进来，约 +5MB
- WebAPK 用户升级无影响（v1.4.2 的 PWA color_scheme fix 已包含）

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.3
docker compose pull
docker compose up -d
```

**重要**：`v1.4.1` / `v1.4.2` 镜像在某些环境（Windows / macOS host 构建 + 跨平台部署）会启动崩。**强烈建议所有自托管用户从 v1.4.3 起。**

## 🧪 验证

```bash
# Docker 部署
docker build -t nage:1.4.3 .
docker run --rm -p 3000:3000 nage:1.4.3

# 必查清单（之前 v1.4.1/v1.4.2 跑不起来的都修到这里了）：
# 1. 容器启动不报 'Cannot find module' / 'Could not load sharp'
# 2. 切换空间不再崩
# 3. 访问 /settings/mcp 不崩
# 4. 暗黑模式在 item 详情 / members 刷新保持
# 5. 物品详情页切空间跳回 /items

# CI 推送 tag v1.4.3 后自动构建并 push：
# - ghcr.io/faninx/nage:1.4.3
# - faninx/nage:1.4.3
```

## 📚 文档

- `CHANGELOG.md` — 1.4.3 段
- `docs/releases/RELEASE-NOTES-v1.4.3.md` — 本文件
- `MEMORY.md`（本机）—— sharp + pnpm + Docker standalone 血的教训

## 📊 变更

10 个 commit（自 v1.4.2 tag）：

| Commit | 类型 | 内容 |
|---|---|---|
| `80227ee` | fix(docker) | standalone 缺 bindings / file-uri-to-path |
| `9581d8d` | fix(docker) | standalone 缺 detect-libc / semver |
| `4c9d19b` | fix(ux) | SpaceSwitcher 在 /items/[id] 切空间跳 /items |
| `c018bf7` | fix(docker) | drop --frozen-lockfile 让 pnpm 在 Linux 下重 resolve |
| `f05d415` | fix(docker) | COPY @img/sharp-linux-x64 到顶层 |
| `0101732` | fix(docker) | COPY libvips .so 到 /usr/lib/ |
| `a0b7b63` | fix(ui) | 改用 next-themes ThemeProvider |
| `22acdbe` | fix(docker) | 一锅端 @img/*（build 失败：glob 多源冲突） |
| `376dbdf` | fix(docker) | ENV target-platform=linux + drop --frozen-lockfile（被 c018bf7 覆盖但留着参考） |
| `edbcb0b` | fix(docker) | 显式 COPY 每个 @img/* runtime dep（最终方案） |