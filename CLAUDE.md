# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **重要**：写 Next.js 代码前先读 `AGENTS.md`——本项目用的是 Next.js 16，API / 约定 / 文件结构跟你训练数据里的 Next.js 不一样（`cookies()` 异步、`proxy.ts` 不是 `middleware.ts`、`params` 是 Promise 等）。

## 项目状态

**纳格（Nage）** 是一个轻量、自托管的物品收纳管理系统。

- 中文名：**纳格**（拼音：Nà gé）
- 英文名：**Nage**
- 包名 / 数据库名 / 目录：`nage`（小写）
- 当前版本：**v1.2.1**（commit `6d7dc82` + tag `v1.2.1`）

**已发布**：`v1.0 MVP`（M1–M5）→ `v1.0.1`（许可+反代 BYO）→ `v1.1.0`（M7 多用户/多空间）→ `v1.1.1`（Docker 镜像 650MB→510MB）→ `v1.2.0`（详情页图片全屏+标签内联+描述 Textarea）→ `v1.2.1`（移动端 UX + buildTree 渲染 bug）。

**下一步 v1.3 计划**：F13 借出归还 / F14 保质期增强收口 / F16 PWA / F18 i18n（数据模型 `borrow_records` 表已在 v1.1 预留）。

修改代码前务必先读 `PRD.md`（唯一事实源），它定义了完整功能清单 / 数据模型 / 技术栈 / 鉴权设计。详细发布说明见 `docs/releases/RELEASE-NOTES-v*.md`，变更历史见 `CHANGELOG.md`。

## 技术栈（已确认，参见 PRD §6）

- **Next.js 16.2.7** App Router + TypeScript（注意：PRD 写的是 15，落后了）
  - `cookies()` / `headers()` 是**异步**（`await cookies()`）
  - 路由保护文件叫 `src/proxy.ts`（不是 `middleware.ts`）
  - `params` / `searchParams` 是 `Promise<...>`
  - 启动钩子用 `src/instrumentation.ts`（详见"启动机制"小节）
  - 构建用 `output: "standalone"`（`next.config.ts`）—— Docker 镜像从 650MB 降到 510MB
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

```
src/
  app/
    (auth)/login/         # 登录页（page + actions）
    (app)/                # 登录后布局（顶栏 + 移动 Tab + 侧栏）
      page.tsx            # 仪表盘（ensureDefaultSpace + 统计）
      items/              # 物品 CRUD + 详情页图片全屏查看（v1.2.0）
      locations/          # 位置（5 级树 CRUD + 移动端 touch 拖动 v1.2.1）
      categories/         # 分类 CRUD
      tags/               # 标签 CRUD
      admin/members/      # 成员管理（仅 admin）
      admin/data/         # 数据导入/导出（owner/editor 可操作自己空间）
    spaces/               # v1.1 空间设置 + 新建空间
    api/                  # Route Handlers（仅外部访问用）
      admin/              #   系统级管理 API
      qr/                 #   二维码生成/扫码
      uploads/            #   用户上传图片
    proxy.ts              # 路由保护（不是 middleware.ts）
    instrumentation.ts    # 启动钩子（bootstrap + PUBLIC_URL 校验）
  lib/
    db/                   # Drizzle schema + 实例 + 复杂查询（import "server-only"）
      index.ts            #   DB 实例
      schema.ts           #   9 张表定义（users/spaces/space_members/locations/categories/tags/items/item_images/item_tags + borrow_records 预留 + login_attempts）
      items-query.ts      #   复杂查询 helper
    auth/                 # JWT、密码、session、登录失败计数、bootstrap、空间 ACL
      jwt.ts              #   JWT 签发/校验
      password.ts         #   bcrypt 封装
      session.ts          #   getSession / requireSession / requireAdmin / setSessionCookie
      login-attempts.ts   #   失败计数 + 锁定
      bootstrap.ts        #   启动时建管理员 + 生成 JWT_SECRET
      space-access.ts     #   空间级 ACL 服务（getUserSpaceRole / hasSpaceAccess / listAccessibleSpaces / getCurrentSpaceId / ensureDefaultSpace）
    actions/              # Server Actions（每个一组 CRUD）
      types.ts            #   共享 ActionState 类型 + 常量 + defaultSpaceName()（**必须独立文件**，见下）
      _cache.ts           #   revalidatePath 集中
      spaces.ts
      space-switcher.ts   #   v1.1 切空间 action
      space-members.ts    #   v1.1 空间成员管理
      locations.ts        #   5 级深度校验 + 防循环 + buildTree helper
      categories.ts
      tags.ts
      items.ts
      images.ts           #   图片上传/删除（sharp 压缩到 ≤1MB，最多 9 张）
      members.ts          #   系统级成员管理（全部 requireAdmin）
      profile.ts          #   用户自己改昵称/头像/密码
    validation/           # zod schemas（集中）
    space-roles.ts        #   spaceRoleAtLeast() 工具函数
    expiry.ts             #   过期时间颜色档（30 天 / 7 天 / 已过期）
    format.ts             #   通用格式化
  components/
    ui/                   # shadcn 组件
    layout/               # 顶栏、侧栏、Tab、FAB
    location-tree-select.tsx / location-tree-multi-select.tsx / tags-multi-select.tsx   # 跨页复用
data/nage.db              # SQLite 数据库文件（gitignore）
public/uploads/           # 用户上传图片
drizzle/                  # SQL 迁移文件（0000/0001/0002/0003_...）；开发用 db:push，部署用 db:generate 后跑迁移
scripts/                  # E2E 测试 + 备份恢复 + 调试
```

**写入优先用 Server Actions**；**只有需要外部访问（扫码、导入/导出下载、系统级 admin API）才用 Route Handlers**。

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
node node_modules/tsx/dist/cli.mjs scripts/test-http.ts        # 鉴权 + 基础 CRUD
node node_modules/tsx/dist/cli.mjs scripts/test-crud.ts        # 位置/分类/标签/物品 CRUD
node node_modules/tsx/dist/cli.mjs scripts/test-flow.ts        # 完整流程
node node_modules/tsx/dist/cli.mjs scripts/test-items.ts       # 物品专项（图片/搜索/筛选）
node node_modules/tsx/dist/cli.mjs scripts/test-m7-multiuser.ts # v1.1 多用户/多空间
# 调试脚本（连 dev server 跑）
node scripts/debug-token.mjs    # 解码当前 cookie 看 JWT payload
node scripts/debug-render.mjs   # 拉页面 HTML 看 SSR 输出
node scripts/debug-html.mjs / debug-expand.mjs / loader-hook.mjs
```

## 已知坑（已踩过）

- **"use server" 文件不能导出非 async 函数**：把 `ActionState` 类型和 `DEFAULT_SPACE_NAME` 常量移到独立的 `types.ts`
- **`"use server"` 文件里 zod schema 不要 `export`**（Next 16 报错）——直接 `const` 然后用
- **Server component 不能向 client component 传函数**（如 `icon: Home`）：传字符串 key，client 组件自己 import 图标并查表
- **`useSearchParams` 必须包在 `<Suspense>` 里**：否则 Next 16 build 会 fail
- **Radix `DialogTrigger` 用 `asChild` 不是 `render`**：shadcn radix-nova preset 还是旧 API
- **ESLint 新规则 `react-hooks/set-state-in-effect` 对 useActionState + 关闭 dialog 模式会误报**：`eslint.config.mjs` 已关掉
- **`server-only` 模块在 tsx 脚本里会抛错**：E2E 测试统一走 HTTP（手动签 JWT）+ better-sqlite3 直写 DB，不直接 import server actions
- **better-sqlite3 WAL 模式下 DB 文件被锁**：dev server 跑时手动 `rm data/nage.db*` 会报 "Device or resource busy"，需先停 server
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

## 部署 & CI/CD

- **Docker 镜像**：`Dockerfile` 是 multi-stage，runtime 用 `node server.js`（standalone 入口）。生产部署完整指南见 `DEPLOY.md`，反代示例见 `docs/examples/`（Caddy / Nginx / Cloudflare Tunnel 任选，**反代 BYO**）
- **备份恢复**：`scripts/backup.sh` 用 `sqlite3 .backup` 在线热备，30 天滚动；`scripts/backup-cron.example` 是 crontab 模板
- **CI/CD**：`.github/workflows/docker-publish.yml`——push tag `v*` 时 buildx 多架构（amd64/arm64）→ 推 `ghcr.io/faninx/nage` + `faninx/nage`（Docker Hub）
- **发布流程**：完成 M 阶段 → 用户说"提交" → `git commit` → 用户确认版本号 → `git tag v*` → push 触发 CI 自动构建推送
