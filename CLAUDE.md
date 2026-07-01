# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **新会话阅读顺序**：
> 1. `C:\Users\Faninx\.claude\projects\C--Users-Faninx-Downloads-Nage\memory\MEMORY.md`（会话状态 / 未发版 / 未决事项；本机绝对路径以 `~/.claude/` 实际配置为准）
> 2. 本文件 `CLAUDE.md`（项目规则）
> 3. `AGENTS.md`（Next.js 16 反直觉点，**由 Next.js agent-rules 自动注入**，看 `<!-- BEGIN:nextjs-agent-rules -->` 标记，**不要手改**）
> 4. `PRD.md`（功能 / 数据模型 / 技术栈，事实源）

> **写 Next.js 代码前**：必读 `AGENTS.md`，必要时查 `node_modules/next/dist/docs/` 对应章节。本项目用 Next.js 16：`cookies()` 异步、`proxy.ts`（不是 `middleware.ts`）、`params` 是 Promise、`"use server"` 文件只能 `export` async、多图上传还需 `experimental.proxyClientMaxBodySize` ≥ `serverActions.bodySizeLimit` 等都跟训练数据不一样。

## 项目状态

**纳格（Nage）** 是一个轻量、自托管的物品收纳管理系统。

- 中文名：**纳格**（拼音：Nà gé）
- 英文名：**Nage**
- 包名 / 数据库名 / 目录：`nage`（小写）
- **当前版本**：`package.json` + `git tag --list 'v*'` + `CHANGELOG.md`（CLAUDE.md 不重复版本日志，避免过期）
- **未决 / 进行中**：见 `MEMORY.md`

修改代码前务必先读 `PRD.md`（唯一事实源），它定义了完整功能清单 / 数据模型 / 技术栈 / 鉴权设计。详细发布说明见 `docs/releases/RELEASE-NOTES-v*.md`，变更历史见 `CHANGELOG.md`。

## 技术栈（已确认，参见 PRD §6）

- **Next.js 16.2.7** App Router + TypeScript（注意：PRD 写的是 15，落后了）
  - `cookies()` / `headers()` 是**异步**（`await cookies()`）
  - 路由保护文件叫 `src/proxy.ts`（不是 `middleware.ts`）
  - `params` / `searchParams` 是 `Promise<...>`
  - 启动钩子用 `src/instrumentation.ts`（详见"启动机制"小节）
  - 构建用 `output: "standalone"`（`next.config.ts`）—— Docker 镜像从 650MB 降到 510MB
  - 多图上传：`experimental.serverActions.bodySizeLimit` **和** `experimental.proxyClientMaxBodySize` **必须都设**（proxy 那个 ≥ serverActions，且不要同时设已弃用的 `middlewareClientMaxBodySize`），否则 9 张图上传整页 500（v1.2.x 实测崩在 proxy 默认 10MB 把 body 截了）
- **React 19.2.4** + **Tailwind CSS v4** + **shadcn/ui radix-nova preset**（基于 Radix UI 1.5，用 `asChild` 不是 `render` prop）
- **Drizzle ORM 0.45** + **better-sqlite3 12.10**（单文件 `data/nage.db`，WAL 模式）
- **jose 6**（JWT HS256，7 天）+ **bcryptjs 3**（cost=12，httpOnly cookie 鉴权）
- **zod**（所有 Server Action 入参校验，schema 集中在 `src/lib/validation/schemas.ts`）
- **react-hook-form** 已装但**暂未用**（Server Action + `useActionState` 已够用）
- 包管理：**pnpm 11**

## 鉴权模型（双层）

### 系统级（admin / member）

**管理员模式——没有公开注册**：

1. 首次启动从 `.env.local` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 自动建唯一管理员（缺失则随机生成并写回 `.env.local`）
2. 后续账号由管理员在 `/admin/members` 添加，可停用（`is_active=false`）、可重置密码
3. 系统管理权限仅 admin 拥有：添加/删除成员、查看所有空间、跨空间导入导出
4. 失败 5 次锁 10 分钟（计数存 `login_attempts` 表，防绕过 cookie；`locked_until` 存整数秒）
5. 部署必须 HTTPS，否则 httpOnly + Secure cookie 失效
6. 错误信息统一"用户名或密码错误"防用户名枚举；用户不存在时也跑一次 bcrypt 防 timing 攻击

### 空间级（owner / editor / viewer）——v1.1+ 主授权模型

每个用户首次进入系统时自动建一个默认空间（名字 = `"{昵称}的空间"`）。空间间数据完全隔离。

| 操作 | owner | editor | viewer |
|---|---|---|---|
| 增删改物品/位置/分类/标签 | ✅ | ✅ | ❌（只读） |
| 改空间名 / 删空间 | ✅ | ❌ | ❌ |
| 邀请/移除/改角色成员 | ✅ | ❌ | ❌ |
| 导入/导出该空间数据 | ✅ | ✅ | ❌ |

**数据迁移保证**：v1.1 起每个老空间都有一行 owner（`spaces.owner_id`），所以"成员 vs 非成员"二分退化为"有 row vs 没 row"。

**当前空间**：`users.last_space_id` 字段持久化每个用户上次所在空间，切换后记住。空间成员表（`space_members`）的 `spaceRoleAtLeast(role, minRole)` 是判断工具函数。

**任何 owner 校验都在 service 层做**——每个 Server Action 自己查 DB 确认权限（`hasSpaceAccess(uid, sid, minRole)`），不依赖路由层。**不要加注册页面或公开注册接口**。

## 启动机制（`src/instrumentation.ts`）

Next.js 启动时自动跑 `register()`，调 `ensureBootstrap()` 做三件事：

1. **建管理员**：`users` 表为空时从 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 建唯一管理员；缺失则随机生成并**写回 `.env.local`**
2. **生成 JWT_SECRET**：env 缺失时随机生成并**写回 `.env.local`**，保证重启后 cookie 仍有效
3. **校验 PUBLIC_URL**：设了就解析校验协议（http/https），没设就 warn"QR 二维码会指向 localhost"

> 首次启动控制台会打印一个带管理员账密的方框（emoji + 中英文混排），包含 `.env.local` 写入说明。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ADMIN_USERNAME` | ❌（首次启动可空） | 管理员用户名 |
| `ADMIN_PASSWORD` | ❌（首次启动可空） | 管理员密码；空则随机生成 |
| `JWT_SECRET` | ❌（首次启动可空） | JWT 签名密钥；空则随机生成并写回 |
| `PUBLIC_URL` | ❌（但生产建议设） | 公网完整 URL（如 `https://nage.example.com`），QR 码拼这个前缀；空则指向 `localhost` |
| `NODE_ENV` | dev/prod | 生产环境下 cookie 自动加 `Secure` 标志 |
| `APP_PORT` | Docker | 应用监听端口，默认 3000 |

## 代码组织约定

读 5 个目录就能定位任何新功能——架构信息见下，每个文件做什么 `Read` 一下就有：

- `src/app/` — 路由 + page。**写入走 Server Action**，**外部访问（扫码、导入/导出下载、系统级 admin API）才用 Route Handler**。两个特殊文件名：`proxy.ts`（不是 `middleware.ts`，做路由保护）/ `instrumentation.ts`（Next 16 启动钩子，跑 `ensureBootstrap()`）。
- `src/lib/auth/` — JWT / 密码 / session / 登录失败计数 / bootstrap / 空间 ACL。入口函数：`requireSession()` / `requireAdmin()` / `hasSpaceAccess(uid, spaceId, minRole)`。
- `src/lib/actions/` — 每个领域一个 `"use server"` 文件。**`"use server"` 文件只能 `export` async 函数**——类型 / 常量 / 工具必须放 `types.ts`（无 directive）。共享 zod schema 从 `src/lib/validation/` 引用，**不要在 action 文件里 `export` 新的 zod schema**（Next 16 报错）。
- `src/lib/db/` — Drizzle schema + 复杂查询。`import "server-only"`，E2E 脚本**不能**直接 import（统一走 HTTP 手动签 JWT + better-sqlite3 直写 DB，见下方"已知坑"）。**新建空间副作用**：首次登录 + `createSpaceAction` 都会调 `seed-space-defaults.ts` 自动种入通用位置(13) + 分类(10)，改空间 / 分类相关逻辑时心里要有这个 seed。
- `src/lib/validation/` — 所有 zod schema 集中。
- `src/components/` — `ui/`（shadcn）/ `layout/`（顶栏 / 侧栏 / Tab / FAB）/ 跨页复用选择器（`location-tree-select` 等）。

仓库根：`data/nage.db`（SQLite，gitignore）/ `public/uploads/` / `drizzle/0000_*.sql` 起（迁移；开发 `db:push` 直推，部署 `db:generate` + 跑迁移）/ `scripts/`（E2E + 备份恢复 + 调试）。

## Server Action 关键约束

1. **`"use server"` 文件只能导出 async 函数**。类型/常量/工具函数必须放 `src/lib/actions/types.ts` 这种不带 `"use server"` 的文件
2. **每个 action 入口都 `await requireSession()`**（admin-only 的用 `requireAdmin()`）—— proxy.ts 只做乐观检查
3. **空间级校验**用 `await hasSpaceAccess(uid, spaceId, minRole)`，在 service 层查 DB
4. **zod 校验** 入参（schema 集中在 `src/lib/validation/schemas.ts`）
5. **错误返回 `{ error: string }`，不 throw**；用 `revalidatePath()` 刷新
6. **zod schema 在 `"use server"` 文件里不要 `export`**（Next 16 会报错）—— 直接 `const X = z.object(...)` 然后用

## 移动端优先

- 移动端底部 5 Tab：首页 / 物品 / 位置 / 分类 / 标签（admin 在 PC 侧栏多"成员"和"数据"，移动端塞不下）
- PC 端左侧固定侧栏 + 右侧主区
- 同一组件用 Tailwind 响应式类适配，**不要写两套组件**
- 触控目标 ≥ 44×44px（用 shadcn 默认的 size）
- 移动端列表操作按钮常显：`opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`
- 移动端拖动：HTML5 `draggable` 在 iOS Safari / Android Chrome 不响应 touch 事件，**必须**自实现 `touchstart` / `touchmove` / `touchend` + `addEventListener({passive:false})` 绕过 React 默认 passive
- 暗黑模式 v1.0 已完成（next-themes 浅/暗/跟随三档），样式用 shadcn 的 CSS variables 写

## 常用命令

```bash
# 开发
pnpm dev
# 构建 / 类型 / lint
pnpm build && pnpm typecheck && pnpm lint
# 数据库
pnpm db:push       # Drizzle schema → SQLite（开发用，直接推不生成迁移）
pnpm db:studio     # Drizzle Studio GUI
pnpm db:generate   # 生成迁移文件到 drizzle/（部署用，配合 migrate）
pnpm db:seed       # tsx src/lib/db/seed.ts（灌测试数据）
# E2E 测试（dev server 需跑在 :3000；统一走 HTTP 手动签 JWT + better-sqlite3 直写 DB）
# 注：package.json 没有 "test" 脚本——E2E 全部走 tsx 手动调用 scripts/test-*.ts
node node_modules/tsx/dist/cli.mjs scripts/test-http.ts        # 鉴权 + 基础 CRUD
node node_modules/tsx/dist/cli.mjs scripts/test-crud.ts        # 位置/分类/标签/物品 CRUD
node node_modules/tsx/dist/cli.mjs scripts/test-flow.ts        # 完整流程
node node_modules/tsx/dist/cli.mjs scripts/test-items.ts       # 物品专项（图片/搜索/筛选）
node node_modules/tsx/dist/cli.mjs scripts/test-m7-multiuser.ts # v1.1 多用户/多空间
node node_modules/tsx/dist/cli.mjs scripts/test-mcp.ts         # v1.3 MCP server（5 个 read 工具 + 双轨鉴权 + 空间 ACL）
# 调试脚本（连 dev server 跑；.mjs 直接用 node 调，.ts 走 tsx）
node scripts/debug-token.mjs              # 解码当前 cookie 看 JWT payload
node scripts/debug-render.mjs             # 拉页面 HTML 看 SSR 输出
node scripts/debug-html.mjs               # 看页面 HTML 结构
node scripts/debug-expand.mjs             # 展开调试
node scripts/loader-hook.mjs              # loader 钩子调试
```

## 已知坑（已踩过）

- **"use server" 文件不能导出非 async 函数**：把 `ActionState` 类型和 `DEFAULT_SPACE_NAME` 常量移到独立的 `types.ts`
- **`"use server"` 文件里 zod schema 不要 `export`**（Next 16 报错）——直接 `const` 然后用
- **Server component 不能向 client component 传函数**（如 `icon: Home`）：传字符串 key，client 组件自己 import 图标并查表
- **`useSearchParams` 必须包在 `<Suspense>` 里**：否则 Next 16 build 会 fail
- **Radix `DialogTrigger` 用 `asChild` 不是 `render`**：shadcn radix-nova preset 还是旧 API
- **ESLint 新规则 `react-hooks/set-state-in-effect` 对 useActionState + 关闭 dialog 模式会误报**：`eslint.config.mjs` 已关掉
- **`server-only` 模块在 tsx 脚本里会抛错**：E2E 测试统一走 HTTP（手动签 JWT）+ better-sqlite3 直写 DB，不直接 import server actions
- **better-sqlite3 WAL 模式下 DB 文件被锁**：dev server 跑时手动 `rm data/nage.db*` 会报 "Device or resource busy"。**完整重置协议**：① 停 dev server → ② `rm -f data/nage.db data/nage.db-shm data/nage.db-wal` → ③ 重启（首次启动会自动重建管理员，会清空所有数据，包括上传的图片在 `public/uploads/` 的引用也要清掉）
- **Turbopack production 不服务 `public/` 启动后新增的文件**（v1.2.x 修复）：`/uploads/*` 必须 rewrite 到 `/api/uploads/[...path]` Route Handler，每次读盘服务，否则用户上传图片保存后 404。**不要"清理"next.config.ts 里的 rewrites** —— 觉得多余删了会立刻回归
- **不要硬编码 `cookie: 'nage_session=...'` 字面量到 client component**：cookie 操作只在 server side
- **`buildTree` 不可假设 DB fetch 顺序里父先于子**（v1.2.1 critical bug）：拖动后子 `sortOrder=(i+1)*10=10` < 父 `sortOrder≥20`，`ORDER BY sortOrder,id` 把子排在父前，子遍历时父还没进 map → 子被当孤儿挂根。**必须用递归 `visit()` + `visited` set** 保证父先处理，迭代顺序不变。**DB 端从来没出错，纯粹是渲染 bug**——v1.2.0 拖过位置的实例升级后刷新就显示正确
- **不要在文件里写 emoji**（用户没要求，但 `instrumentation.ts` 启动横幅例外）

## 增量开发守则

- **每完成一个 M 阶段才提交**（用户说"提交"再 git commit）
- **不要创建未在 PRD 出现的功能**——遇到"顺手优化"的诱惑时，先问
- **不要写注释解释"为什么用 for 循环"这种显然的代码**
- 数据库 schema 改了必须同步更新 `PRD.md` 的 §5 + 写迁移到 `drizzle/`
- 优先用 Server Components；只把需要交互/状态的部分标 `"use client"`
- 写完一段功能先 `pnpm typecheck` 和 `pnpm build`，再继续下一段
- 用户没问 emoji 之前默认不写

## 跨会话记忆

`C:\Users\Faninx\.claude\projects\C--Users-Faninx-Downloads-Nage\memory\MEMORY.md` 记录项目状态、用户偏好、已踩过的坑。每个新会话开始时先读它。

## MCP Server（M8.1+）

让外部 AI agent（Claude Desktop / Cursor / Cline / 自建 agent）通过标准化协议调 Nage 数据。

- **端点**：`POST /api/mcp`（Streamable HTTP transport；GET/DELETE 返回 405，M8.1 不开 session）
- **鉴权双轨**：Bearer `Authorization: Bearer nage_mcp_<43 chars>` **或** `nage_session` cookie；都没有 → JSON-RPC `-32000` + HTTP 401
- **Token 存**：`mcp_tokens` 表（per-user；SHA-256 hash + UNIQUE INDEX；明文 token 只在创建响应里返回一次）
- **Token 管理 UI**：`/settings/mcp`（顶栏头像菜单 → "MCP 令牌"）
- **Origin 校验**（防 DNS rebinding）：无 Origin 放行；dev = localhost；prod = `PUBLIC_URL` 同源
- **工具**：`src/lib/mcp/tools/read.ts`（5 个 read，全部 `hasSpaceAccess(uid, sid, "viewer")`）
- **鉴权解析**：`src/lib/auth/mcp-auth.ts`（Bearer 优先，fallback cookie）
- **路由**：`src/app/api/mcp/route.ts`，`runtime = "nodejs"` 必设
- **E2E**：`scripts/test-mcp.ts`（MCP Client SDK + manual JWT）
- **已知坑**：
  - **Stateless 模式 SDK 强制每个请求新建 server + transport**（一个 McpServer 同一时刻只能连一个 transport；复用会抛 "Stateless transport cannot be reused"）。已在 `route.ts` 实现。
  - **Accept header 必须含 `application/json` 和 `text/event-stream` 两者**（spec 要求即使 enableJsonResponse=true）。
  - `proxy.ts` 必须把 `/api/mcp` 加到 PUBLIC_PATHS，否则 CLI Bearer 请求被 307 redirect 到 `/login`。

**未做（留 M8.2+）**：写工具 / Resources / Prompts / `Mcp-Session-Id` 会话 / SSE 流响应 / 多 worker AsyncLocalStorage / per-token 速率限制 / 写操作的 scope 细分。

## 部署 & CI/CD

- **Docker 镜像**：`Dockerfile` 是 multi-stage，runtime 用 `node server.js`（standalone 入口）。生产部署完整指南见 `DEPLOY.md`，反代示例见 `docs/examples/`（Caddy / Nginx / Cloudflare Tunnel 任选，**反代 BYO**）
- **备份恢复**：`scripts/backup.sh` 用 `sqlite3 .backup` 在线热备，30 天滚动；`scripts/backup-cron.example` 是 crontab 模板
- **CI/CD**：`.github/workflows/docker-publish.yml`——push tag `v*` 时 buildx 多架构（amd64/arm64）→ 推 `ghcr.io/faninx/nage` + `faninx/nage`（Docker Hub）
- **发布流程**：完成 M 阶段 → 用户说"提交" → `git commit` → 用户确认版本号 → `git tag v*` → push 触发 CI 自动构建推送
