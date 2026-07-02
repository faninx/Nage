# 更新日志

所有对项目有显著影响的变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.3] - 2026-07-03

Docker standalone 依赖修复合集（v1.4.1/v1.4.2 启动崩溃系列 bug）+ next-themes 暗黑模式改造。**0 数据库 schema 变化，0 数据迁移**。

### 修复

- **Docker 启动 'Cannot find module bindings / file-uri-to-path'**（80227ee）：pnpm 不 hoist transitive deps，Dockerfile 显式 COPY 平铺
- **Docker 启动 'Cannot find module detect-libc / semver/functions/coerce'**（9581d8d）：sharp 的 transitive deps 同根因；sub-path require 形式 grep 时要单独查
- **Docker 启动 'Could not load sharp module using linux-x64'**（c018bf7 / f05d415 / 0101732 / edbcb0b）：四件套——deps 阶段 drop --frozen-lockfile + ENV target-platform=linux；runtime 显式 COPY `@img/colour` / `@img/sharp-linux-x64` / `@img/sharp-libvips-linux-x64`；COPY libvips .so 到 `/usr/lib/x86_64-linux-gnu/`
- **PC 浏览器暗黑模式刷新跳回 light（item 详情 / members 列表）**（a0b7b63）：改用 `next-themes` `ThemeProvider` 替代手写 ThemeScript。next-themes 自带 canonical FOUC 脚本，比手写在 React 19 + Next 16 边缘 case 稳
- **物品详情页切空间跳 /items**（4c9d19b）：`SpaceSwitcher` 检测 `/items/[id]` 切空间后 `router.push('/items')`

### 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.3
docker compose pull
docker compose up -d
```

**强烈建议**：v1.4.1 / v1.4.2 镜像在跨平台部署（Windows/macOS host 构建）下会启动崩，必须升 v1.4.3。

## [1.4.2] - 2026-07-02

主题修复 + Docker compose 清理。**0 数据库 schema 变化，0 数据迁移**。

### 修复

- **PWA 在 Android 桌面图标打开后强制 light 模式**（8299cb0）
  - 根因：`public/manifest.json` 缺 `color_scheme` 字段（UA 默认 normal → 强制 light）
  - 修复：manifest 加 `color_scheme: "light dark"` + `layout.tsx` viewport.themeColor 改 media-query 响应式（light=`#fafafa` / dark=`#0f172a`）
- **PC 浏览器暗黑模式刷新跳回 light**（ca82a15，item 详情 / 成员列表尤其明显）
  - 根因：`ThemeScript` 在 `<body>` 里，Next.js 16 生产优化器在某些页面会推迟 body 级 script 执行
  - 修复：ThemeScript 移到 `<head>`（canonical next-themes 模式）
- **`docker-compose.yml` `nage-uploads` 死 volume**（65442d3）：v1.4.0 M10 后 uploads 走 `data/uploads/`，compose 挂 `nage-uploads:/app/public/uploads` 失效，删掉
- **文档 stale 引用 `public/uploads/`**（ea09f25）：DEPLOY.md / PRD.md / CLAUDE.md / README.md 同步到 `data/uploads/`

### 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.2
docker compose pull
docker compose up -d
# WebAPK 用户：Chrome 设置 → 应用 → Chrome → 存储 → 清除存储（manifest 改了浏览器会缓存老的）
```

## [1.4.1] - 2026-07-02

PWA 支持 + Docker standalone 依赖修复 + MCP E2E CI。**0 数据库 schema 变化，0 数据迁移**。

### 新增

- **PWA 支持（F16）**：`@ducanh2912/next-pwa@10.x` + 自定义 `N` 字标图标
  - `public/manifest.json`（name / short_name / 主题色 / 三个尺寸 icon）
  - `public/icons/icon-{192,512,maskable-512}.png` + 源 `icon.svg`（sharp 渲染）
  - service worker (`/sw.js`) 自动生成：仅缓存静态资源；`/api/*` 走 NetworkFirst（10s timeout）— 符合 PRD「写入需联网」
  - `layout.tsx` 加 viewport（关 zoom + theme-color）+ apple-mobile-web-app-* + manifest link
  - `scripts/build-pwa-icons.mjs` 重新生成 icon
  - **CI 影响**：`pnpm build` 加 `--webpack` flag（next-pwa 10.x 是 webpack 插件，Next 16 默认 Turbopack 冲突；docker build 自动用新命令）

### 修复

- **Docker standalone 启动报 `Cannot find module 'bindings'` / `file-uri-to-path'`**（cf6bdc1 / 0272667 / 9872932）
  - 根因：`bindings` 是 `better-sqlite3` 的 transitive dep，pnpm 不 hoist 到顶层 `node_modules/`；Next.js 的 `outputFileTracingIncludes` 用 `.pnpm/` 路径在 standalone flat 结构里不可靠
  - 修复：`Dockerfile` runtime 阶段显式 `COPY --from=deps` bindings + file-uri-to-path；`next.config.ts` 撤回不生效的 `.pnpm/` 路径规则

### CI

- 新增 `.github/workflows/test-mcp.yml`：每个 push / pull_request 跑 E2E
  - 启 dev server + 跑 `scripts/test-mcp.ts` + 失败时上传 dev log artifact
  - 覆盖 11 个 section / 70+ 断言
- `scripts/test-mcp.ts` 扩：种子基础数据（3 cat / 3 tag / 1 loc / 1 item + 1 image）+ E2E 自给自足建测试空间（CI fresh DB 不依赖现有数据）
- `.github/workflows/docker-publish.yml` 修 `Setup Node.js` 失败（`pnpm/action-setup` + Node 24 兼容性）

### 升级指引

```bash
cd /opt/nage
git pull
docker compose pull
docker compose up -d
# 浏览器会提示「添加到主屏」（HTTPS 部署才有此功能）
```

## [1.4.0] - 2026-07-02

MCP Server 全套能力 + 安全加固。**新增 1 个数据库 schema（M9.1 `mcp_tokens.scope` 列）**，需要迁移 `0005_eminent_avengers.sql`（自动应用）。0 数据迁移。

### 新增 (MCP)

- **M8.1 — MCP Server 只读 MVP**：`/api/mcp` Streamable HTTP + Bearer token 双轨鉴权（cookie + `nage_mcp_<43 chars>`）+ 5 个读工具（`list_locations` / `list_categories` / `list_tags` / `search_items` / `get_item`）+ Settings UI 管理令牌
- **M8.2 — 写工具 + Scope 二档**：`create_item` / `update_item` / `delete_item`（需 `editor` scope）+ `mcp_tokens.scope` 列（`reader` / `editor`）
- **M8.3 — Per-token 速率限制**：默认 60 req/min/token（env `MCP_RATE_LIMIT_PER_MIN` 可配），cookie / Bearer 独立窗口
- **M8.4 — Resources + Prompts**：4 个 resource template（`nage://items/{id}` + 3 个 `nage://spaces/{sid}/*`）+ 3 个 prompt（`audit_expiring_soon` / `find_item` / `inventory_summary`）
- **M8.5 — AsyncLocalStorage 会话上下文**：为多 worker / 异步并发安全打基础；暂不开 `sessionIdGenerator`（stateless 设计够用）
- **M9.1 — `list_spaces` 工具**：列出 caller 有访问权的所有空间（含 role / isOwner / ownerNickname / memberCount）—— 解决 Bearer 鉴权下"鸡生蛋"问题
- **M9.2 / M9.3 / M9.4 — location / category / tag CRUD**：各 3 个工具（create / update / delete）。`update_*` 全部支持 **partial update 语义**（缺字段=不变；显式 `null`=清空；显式值=改）
- **M9.5 — `update_item` 改 partial update**：原本 full-replace，现在 PATCH 语义

### 安全修复（M10）

- **`/uploads/*` 0day 鉴权绕过**（itemId 自增可枚举 → 任何人能看所有空间物品图）
  - 修复：`public/uploads/` 迁到 `data/uploads/`（dev 模式 Next.js 不再静态服务绕开 route handler）
  - `proxy.ts` 移除 `/uploads/` 短路，让请求走到 `rewrite → /api/uploads/[...path]`
  - route handler 加 `resolveMcpAuth` + `hasSpaceAccess(viewer)` 校验
  - `(itemId → spaceId)` LRU 缓存（5000 条上限，满了清空）
  - `Cache-Control: private`（避免 CDN 共享泄露）

### 文档

- `docs/mcp-integration.md` 完整接入文档（30 秒接入 + 鉴权 + 工具参考 + Resources/Prompts + 错误码 + 客户端配置 + 速查卡）
- `docs/releases/RELEASE-NOTES-v1.4.0.md` 完整发布说明

### 升级指引

```bash
cd /opt/nage
git pull
docker compose pull
docker compose up -d
# 数据迁移：bootstrap.ts 自动跑 migrate()，0005 加 mcp_tokens.scope 列
# 老 mcp_tokens 行的 scope 默认 'reader'，不破坏已有
```

## [1.2.1] - 2026-06-17

移动端 UX 修复 + 位置拖动 buildTree 渲染 bug。**0 数据库 schema 变化，0 数据迁移**。

### 修复

- **位置拖动后 UI 关系错乱（critical）**:`buildTree` 假设 DB fetch 顺序里父节点一定先于子节点。拖动后子节点被服务端分配 `sortOrder=(i+1)*10=10`,父作为根自己通常 `sortOrder≥20`,`ORDER BY sortOrder,id` 把子排在父前 → `buildTree` 遍历子时父还没进 map → 子被当孤儿挂根。`buildTree` 改递归 `visit()` + `visited` set,保证父先处理,迭代顺序不变。**DB 端从来没出错,纯粹是渲染 bug**——v1.2.0 拖过位置的实例升级后刷新就显示正确的关系
- **移动端位置列表无法拖动**:iOS Safari / Android Chrome 不响应 HTML5 `draggable` 元素的 touch 事件(浏览器历史问题,不是代码 bug)。自实现 `touchstart` / `touchmove` / `touchend` 拖动,复用桌面端 before/after/child 视觉和 `reorderLocationAction`。`addEventListener` + `{passive: false}` 全局注册绕过 React 默认 `passive: true`。`performDropRef` 绕开闭包陷阱。`(pointer:coarse)` 媒体查询在移动端关掉 `draggable` 避免 iOS 长按弹"拖图副本"冲突。`touchend` 用 `changedTouches[0]` + `flushSync` 补一次 hit-test 防最后一次 touchmove 漂移
- **移动端列表操作按钮看不见**:物品 / 位置 / 分类 / 标签列表的操作 Icon 只在 PC 端 `group-hover` 才显示,移动端没 hover 所以看不见。Tailwind 类改 `opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`,移动端常显、PC 端保持 hover
- **弹窗按钮文案与标题动词不对齐**:标题"新建位置"按钮叫"创建"、标题"快速添加物品"按钮叫"录入"。`<ItemForm>` 加可选 `submitLabel?` prop,调用方传"新建" / "新增" / "添加" / "保存"对齐标题动词
- **移动端 Emoji 下拉无法滚动**:编辑分类点 Emoji 按钮,下拉网格在移动端无法上下滚动。网格容器加 `touch-pan-y` + `overscroll-contain` + `onTouchMove stopPropagation`,`PopoverContent` 加 `max-w-[calc(100vw-2rem)]` 防止溢出。高度保持 `max-h-72`,`touch-pan-y` 才是关键
- **README GitHub Release badge 404**:badge URL 用了大写 `faninx/Nage`,shields.io 走 GitHub API 大小写敏感 404。改 `faninx/nage`(项目实际仓库名是小写,跟 package.json / Docker 镜像名一致)

### 文档

- `docs/releases/RELEASE-NOTES-v1.2.1.md` 完整发布说明(根因分析 + 技术决策 + 验证步骤)
- `CLAUDE.md` 状态行更新 v1.2.1 已发

### 升级指引

```bash
cd /opt/nage
git pull
git checkout v1.2.1
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 不会跑任何新迁移(v1.1.0 的 9 张表已建好)。**如果你之前在 v1.2.0 拖动过位置**——DB 里的 `parentId` / `sortOrder` 其实都是对的,UI 渲染错乱是 buildTree bug,升级后刷新页面会显示正确的关系树。

如果是 ghcr.io 镜像用户,编辑 `docker-compose.yml` 把 image 改成 `:1.2.1`,然后 `docker compose pull && docker compose up -d`。

## [1.2.0] - 2026-06-17

### 新增（详情页图片全屏查看）

- **点击图片放大**:详情页 carousel 任意图片点击 → 全屏 Dialog 看大图
- **滚轮缩放 + 缩放点跟着鼠标**:指数级缩放（`Math.exp(-deltaY * 0.002)`），clamp [0.1, 10]，鼠标位置稳定不变
- **拖拽平移**:Pointer Events + `setPointerCapture`，鼠标 / 触摸 / 笔统一
- **重置按钮 (1:1 实际大小)**:顶栏居中 `↺` 图标（`RotateCcw`）点击 = `fitTo1to1()` = scale=1 + 图片居中
- **缩略图条切图**:底部居中缩略图条（所有图），当前高亮白边，点切图；多图键盘 ←/→ wrap-around
- **a11y**:`DialogTitle` sr-only + 各按钮 `aria-label` 完整

### 优化

- **标签选择器**:选中标签直接内联显示在 trigger 内（chip 列表 + X 单删），不再藏在下拉里
- **物品表单描述字段**:`Input` → `Textarea`（rows=3, maxLength=2000），可写多行描述

## [1.1.1] - 2026-06-16

### 变更（Docker 镜像瘦身）

- **`output: "standalone"` 模式**:`next.config.ts` 加 `output: "standalone"` + `outputFileTracingIncludes`（sharp / better-sqlite3 / @img / bindings 4 个 native module），Docker 镜像从 ~650MB 降到 **510MB**（-22%）。runtime 不再带完整 `node_modules` + `.next` + `src`，改用 Next.js 静态分析后的最小集 `.next/standalone`（~106MB），外加 `.next/static` / `public` / `scripts` / `drizzle`
- **Dockerfile 调整**:
  - builder 阶段去掉 `pnpm prune --prod`（standalone 自带最小集）
  - runtime 阶段 `COPY --from=builder /app/.next/standalone ./` + 单独拷 `.next/static` `public` `scripts` `drizzle`
  - `CMD ["node", "server.js"]`（standalone 入口不再是 `next start`）
- **corepack 走 npmmirror**:corepack 默认从 `registry.npmjs.org` 拉 pnpm 元数据，国内网络经常 timeout。加 `ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com` 到 deps + builder 阶段。国外 CI 仍走默认 npmjs.org 也没副作用
- **遗留文档修正**:`docs/releases/RELEASE-NOTES-v1.0.{0,1,2,3,4}.md` 内的相对路径从 `./` 改成 `../../`（v1.1.0 移到 `docs/releases/` 时漏改，链接全断）

### 升级指引

不需要任何数据迁移 —— 跟 v1.1.0 一样的步骤。

```bash
cd /opt/nage
git pull
git checkout v1.1.1
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 不会跑任何新迁移（v1.1.0 的 `0003_flimsy_orphan` 已跑过）。

如果是 ghcr.io 镜像用户，编辑 `docker-compose.yml` 把 image 改成 `:1.1.1`，然后 `docker compose pull && docker compose up -d`。

## [1.1.0] - 2026-06-15

### 新增（M7 — 多用户/多空间协作）

- **多空间**：每个用户可建多个空间（家 / 公司 / 实验室……），空间间数据完全隔离。首次登录自动建一个默认空间（名字 = `"{昵称}的空间"`）
- **空间成员三档角色**：
  - **owner**：全部权限 + 改空间名 / 删空间 / 管理成员 / 转让所有权
  - **editor**：增删改该空间内的物品 / 位置 / 分类 / 标签
  - **viewer**：只读
- **空间设置页**（`/spaces/[id]/settings`，仅 owner）：成员管理（按用户名搜索、邀请、改角色、移除）+ 改空间名 + 删空间。**最后一名 owner 不可降级 / 不可移除**（强一致保护，避免空间变孤儿）
- **空间切换器**：顶栏 Logo 右侧，点开下拉看所有可访问空间 + 当前角色 Badge + 「当前」标记 + 「空间设置 / 新建空间」快捷入口（仅 owner）
- **新建空间页**（`/spaces/new`）：所有登录用户可用，自动成为 owner
- **当前空间持久化**：每个 user 记一个 `users.last_space_id`，切换后记住，登录回来直接落点上次所在空间
- **数据导入 / 导出权限放宽**：从 v1.0 仅管理员 → v1.1 该空间的 owner / editor 都可操作自己空间。viewer 仍然 403

### 修复

- **登录锁定的剩余时间显示 `NaN 分钟后再试`**：`login_attempts.locked_until` 列声明为 `integer mode='timestamp'`，但旧 SQL 写的是 `datetime(..., 'unixepoch')` 字符串。Drizzle 读出来拿不到有效时间，`Math.ceil(NaN/60000)` 渲染成「NaN」。SQL 改成写 `${now + LOCK_DURATION_MS / 1000}` 整数秒，启动时 `bootstrap.ts` 顺手清一遍已经写脏的行
- **编辑物品保存图片不展示**：`ItemForm` 的 `onFileChange` 选完图后 `e.target.value = ""` 把刚写入的 `files` 数组抹掉了，提交时 `formData` 拿不到文件，server 静默 return 0 张图。`onFileChange` 不再清空 input，留给 form-level reset
- **成员添加偶发 `A 'use server' file can only export async functions`**：之前在 `space-members.ts` 里 `export` 了几个 zod schema 对象。`"use server"` 文件只能导出 async 函数，schema 只在本文件用，`export` 去掉
- **`/admin/data` 页面 viewer 误进入**：页面没有 owner 校验。现在进入前 `hasSpaceAccess(...,"editor")` 校验，不满足 redirect（route 还会再校验一次，防御性）

### 数据库

- 新表 `space_members (space_id, user_id, role, created_at)`，复合主键 + FK 级联删除 + `space_members_user_idx`（按 user 查其可访问空间）
- 新列 `users.last_space_id`，FK → `spaces.id`，ON DELETE SET NULL
- 迁移 `drizzle/0003_flimsy_orphan.sql`；启动时 `bootstrap.ts::backfillSpaceMembers` 幂等地给每个老空间补一行 `role='owner'` 的 member 行，同时把 `last_space_id` 指向该 user 最早拥有的空间。**幂等**：重复启动无副作用

### 文档

- `PRD.md` §5 数据模型补 `space_members` 表 + `users.last_space_id` 列；§10 里程碑加 M7；§12.2 权限表更新（导入/导出「自己的空间内」即可）
- `README.md` 特性 + 里程碑同步
- `CLAUDE.md` 状态行更新
- 新增 `scripts/test-m7-multiuser.ts`（12 步 E2E，全过）

### 升级指引

```bash
cd /opt/nage
git pull
git checkout v1.1.0
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 会自动跑 `0003_flimsy_orphan` 迁移 + 老空间 backfill，**不需要任何手动 SQL**。

如果是 ghcr.io 镜像用户，编辑 `docker-compose.yml` 把 image 改成 `:1.1.0`，然后 `docker compose pull && docker compose up -d`。

## [1.0.3] - 2026-06-14

### 修复

- **上传图片 HTTP 413 "Body exceeded 1 MB limit"**：Next.js 16 Server Action 默认请求体上限是 1MB，手机原图单张就超。`next.config.ts` 加 `experimental.serverActions.bodySizeLimit: "20mb"`，对齐反代示例的 `client_max_body_size 20M`。应用层 `MAX_IMAGE_BYTES`（单张 10MB）和 `MAX_IMAGES_PER_ITEM`（单物品 9 张）仍会先兜底校验，所以放宽的是「一次提交最多能传多大的合计体积」

### 文档

- `docs/examples/nginx/nage.conf` / `docs/examples/caddy/Caddyfile` / `docs/examples/cloudflare-tunnel/config.yml` 各加一条注释，明确 body 限制在哪一层、谁兜底
- `DEPLOY.md` 故障排查加 §7.6「上传图片报 413」，并列出三种反代的默认 body 上限对比

### 升级指引

镜像用户拉新 tag，源码用户拉代码 `rebuild` 一次：

```bash
cd /opt/nage
git pull
docker compose build app
docker compose up -d
```

如果是 ghcr.io 镜像用户，编辑 `docker-compose.yml` 把 image 改成 `:1.0.3`，然后 `docker compose pull && docker compose up -d`。

## [1.0.4] - 2026-06-14

### 修复

- **上传图片保存后 404 (图片显示不出来)**：Next.js 16 (Turbopack) production server 启动时**一次性**扫 `public/` 建文件清单，启动后新加的文件不服务。表现就是用户上传图片保存后图片 404。`next.config.ts` 加 rewrite `/uploads/:path*` → `/api/uploads/:path*` 把所有 `/uploads/*` 请求转给新增的 `src/app/api/uploads/[...path]/route.ts`，每次请求都去磁盘读最新文件，绕开启动扫描。带 ETag / Last-Modified，文件被覆盖浏览器能拿到新版（304 Not Modified 走正确路径）

### 文档

- `DEPLOY.md` 故障排查 §7.6 加一条"上传图片 404 / 旧图缓存"指引（指向升级 v1.0.4）

### 升级指引

```bash
cd /opt/nage
git pull
docker compose build app
docker compose up -d
```

不需要任何数据迁移 —— 文件位置、DB 路径、volume 挂载都不动，纯粹路由层变化。

## [1.0.2] - 2026-06-14

### 新增

- **编辑物品支持调整图片顺序**：在 `ImageField` 每张已上传图上加 `↑`/`↓` 按钮（边界 disabled、悬停 / 聚焦显现），首张图标记「封面」角标。提交时 `imageOrder` 字段把新顺序发给服务端，服务端校验 permutation 后逐条 `UPDATE sortOrder`。`queryItems` / `queryItemById` 一直按 `sortOrder ASC` 取首张作封面，所以列表 / 详情 / 详情页轮播图首张自动跟着走，无需额外改动
  - 新上传的图仍走 `max(sortOrder)+1` 追加到末尾，跟重排互不干扰
  - `existing.length === 1` 时不显示箭头按钮（单图无意义）

## [1.0.1] - 2026-06-14

### 变更

- **移除 Caddy 集成**：v1.0.0 把 Caddy 写进 `docker-compose.yml` + 项目根 `Caddyfile`。v1.0.1 起反代由用户自己解决,`docker-compose.yml` 只剩 `app` 一个 service。`Caddyfile` 移到 [`docs/examples/caddy/`](./docs/examples/caddy/) 当参考
- **新增反代示例**：[`docs/examples/`](./docs/examples/) 下加 Caddy / Nginx / Cloudflare Tunnel 三个方案,每个带 README + 配置文件
- **端口可配置**:`APP_PORT` 贯通 compose 主机端口、容器端口、容器内 `PORT` 环境变量,默认 3000
- **移动端底部 Tab 增加"标签"**:从 4 个变 5 个(首页 / 物品 / 位置 / 分类 / 标签),admin 仍只多侧栏里的"成员"和"数据"
- **Docker build 切 USTC 镜像源**:国内网络访问 `deb.debian.org` 慢/不可达,`apt-get update` 会卡。新增 `ARG APT_MIRROR=mirrors.ustc.edu.cn`,在 deps + runtime 两个 stage 自动替换默认源。覆盖:`docker build --build-arg APT_MIRROR=deb.debian.org .`(国外环境回退)。实测 `apt-get update` 速度从 27 KiB/s → 5.9 MB/s(约 200 倍)
- **QR 二维码用 PUBLIC_URL 生成公网链接**:之前 `req.nextUrl.origin` 在反代后是 `localhost:3000`,扫码全废。新增 `PUBLIC_URL` 环境变量(自动 trim 尾部 `/`,兼容 `https://x.com` / `https://x.com:8443` 等形式),二维码改用它生成。`instrumentation.ts` 启动时校验,未配会打警告
- **`ACME_EMAIL` 废弃**:`.env.local.example` 加注释说明,不影响已部署实例(它们要么不再升级,要么用自己加的 `ACME_EMAIL` 跑反代)
- **DEPLOY.md 大改**:架构图 / 防火墙 / 启动流程 / 故障排查全部去掉 Caddy 假设,加新章节"架反代"
- **README / PRD 同步**:header 描述、特性列表、技术栈、里程碑更新
- **版本号**:1.0.0 → 1.0.1

### 升级指引

1. `git pull`
2. 如果你之前用 compose 里集成的 Caddy:
   - 保留你自己的 Caddy / Nginx 配置(`docker-compose.yml` 里 Caddy 段被删,但你之前的反代还在跑)
   - 把 `app` service 的 `expose: ["3000"]` 改成 `ports: ["3000:3000"]`(直接调 compose 不便的话,`docker compose up -d` 时 compose 会自己加默认端口)
3. 如果你之前用裸反代(没跑过 compose 里的 caddy service):什么都不用做,新 compose 对你来说完全等价
4. 如果之前 `.env` 里配了 `ACME_EMAIL`:留着没用,删掉也无副作用
5. `docker compose up -d`

## [1.0.0] - 2026-06-12

首次正式发布。v1.0 范围 = PRD §3.1 MVP + §4 完整功能。

### 已完成（M1 - M5）

- **M1 - 基础设施**
  - Next.js 16.2.7 + TypeScript + Tailwind v4 + shadcn/ui (radix-nova)
  - Drizzle ORM + better-sqlite3（WAL 模式）
  - jose JWT (HS256, 7 天) + bcryptjs (cost=12) + httpOnly cookie
  - 管理员模式：首管从 `.env.local` 自动建，账号由管理员后台添加
  - 登录失败 5 次锁 10 分钟（计数存 DB 防绕过 cookie）
  - 错误信息统一"用户名或密码错误"防用户名枚举
  - `src/proxy.ts` 路由保护 + `src/instrumentation.ts` 启动 bootstrap
  - 5 级位置深度校验 + 拖拽排序 + 防循环
- **M2 - 物品 CRUD**
  - 物品：名称、描述、数量、单位、价格、过期时间、图片（多张，sharp 压缩到 1080p JPEG q80）
  - 列表/卡片双视图 + 视图偏好 localStorage 持久化
  - 跨字段模糊搜索 + 位置/分类/标签/过期多维筛选
  - 排序（按更新时间/名称/创建时间）+ 分页
  - 批量删除 + 关联图片清理
  - 共享 `ItemForm`（详情页 + 列表页共用）
- **M3 - 仪表盘**
  - 最近更新 5 件（封面图 + 价格 + 标签色块）
  - 快过期卡片（30 天 / 7 天 / 已过期三档颜色）
  - 「隐藏已过期」开关 localStorage 持久化
- **M4 - 二维码 + 导入导出**
  - 每件物品一个 QR（`/api/qr/item/[id]`，返回 PNG）
  - `/scan` 页（`getUserMedia` + `jsQR` + 手动 ID 输入）
  - 管理员导入/导出（JSON 格式，跨实例可迁移）
  - 位置树 2-pass 重建（id 重映射）
- **M5 - 部署**
  - 多阶段 Dockerfile（deps → builder → runtime）
  - 非 root `nage` 用户 + tini PID 1 + healthcheck
  - docker-compose.yml（5 命名 volume：data/uploads/backups/caddy/caddy-data）
  - Caddyfile（自动 HTTPS + gzip + 安全头）
  - `scripts/backup.sh`（`sqlite3 .backup` 热备 + 30 天滚动）
  - `scripts/restore.sh`（pre-restore 二次保险 + 确认提示）
  - `DEPLOY.md`（架构图 / VPS 准备 / 部署 / 备份 / 升级 / 9 项故障 / 8 项安全清单）

### 端到端测试

- 4 个 E2E 脚本共 **63 个测试全过**：
  - `test-http.ts` - 鉴权 + 失败锁定
  - `test-crud.ts` - 空间/位置/分类/标签/成员 CRUD
  - `test-flow.ts` - 注册→登录→建空间→加物品 完整流程
  - `test-items.ts` - 物品 CRUD + 跳转筛选 + 用户菜单 + FAB + 价格 32 项

### 修复（v1.0.0 收口）

- `ExpiringSoonCard`「隐藏已过期」持久化到 localStorage
- card 视图删除按钮加 `deletingId` 反馈（之前只列表视图有）
- `ItemForm` 删除 `ImageField` 多余 `export`
- `expiring-soon-card.tsx` + `items-client.tsx`：localStorage 模式从「read effect + write effect + hydrated state」改为 lazy initializer + toggle 内写回
- 抽 `src/lib/expiry.ts` 统一过期桶/颜色/标签规则（3 处复制逻辑合 1）
- `const UNSET = "__unset__"` 改 import 共享 `ITEM_FORM_UNSET`
- `bootstrap` 密码生成不再被 username 缺失短路覆盖（修「docker run -e ADMIN_PASSWORD=test123」被忽略的真 bug）
- `Dockerfile` 字体改用 `geist` npm 包本地化（不再依赖外网）
- `Dockerfile` pnpm install 改 npmmirror + 加 store cache（构建速度 80x 提升）

### 文档

- `README.md` - 项目介绍 + 快速开始 + 部署
- `PRD.md` - 产品需求（v1.0 MVP / v1.1 增强 / v2.0 远期）
- `DEPLOY.md` - 部署指南
- `CLAUDE.md` - 协作规范
- `CHANGELOG.md` - 本文件
- `LICENSE` - GPL v3

### v1.1 计划（未做）

- 借出归还流程（F13）
- 保质期增强（剩余天数提醒、批量处理）
- 暗黑模式（F16）
- PWA 离线（F16）
- 多语言（i18n）
