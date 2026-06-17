# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目状态

**纳格（Nage）** 是一个轻量、自托管的物品收纳管理系统。

- 中文名：**纳格**（拼音：Nà gé）
- 英文名：**Nage**
- 包名 / 数据库名 / 目录：`nage`（小写）

**v1.0 MVP 全部完成**（M1–M5：鉴权 / 空间/位置/分类/标签/成员 CRUD / 物品 CRUD / 仪表盘 / 二维码 / 导入导出 / Docker 部署）。**v1.1.0 已发**（M7 多用户/多空间协作）。**v1.1.1 已发**（Docker 镜像瘦身，650MB → 510MB）。**v1.2.0 已发**（详情页图片点击放大 + 标签内联显示 + 描述 Textarea）。**v1.2.1 已发**（移动端 UX 修复 + 位置拖动 buildTree 渲染顺序 bug）。下一步：v1.3 计划（F13 借出归还 / F14 保质期增强收口 / F16 PWA / F18 i18n）。

修改代码前务必先读 `PRD.md`（唯一事实源），它定义了：
- 完整功能清单（v1.0 MVP / v1.1 增强 / v2.0 远期）
- 数据模型（SQLite 表结构）
- 技术栈与鉴权设计
- 里程碑 M1→M5

## 技术栈（已确认，参见 PRD §6）

- **Next.js 16.2.7** App Router + TypeScript（注意：不是 PRD 写的 15）
  - `cookies()` / `headers()` 是**异步**（`await cookies()`）
  - 路由保护文件叫 `src/proxy.ts`（不是 `middleware.ts`）
  - `params` / `searchParams` 是 `Promise<...>`
- **React 19.2.4**
- **Tailwind CSS v4**
- **shadcn/ui radix-nova preset**（基于 Radix UI 1.5；用 `asChild` 不是 `render` prop）
- **Drizzle ORM 0.45** + **better-sqlite3 12.10**（单文件 `data/nage.db`，WAL 模式）
- **jose 6**（JWT HS256，7 天）+ **bcryptjs 3**（cost=12，httpOnly cookie 鉴权）
- **zod**（所有 Server Action 入参校验）
- **react-hook-form** 暂未引入（Server Action + `useActionState` 已够用）
- 包管理：**pnpm 11**

## 鉴权模型（关键约定）

**管理员模式**——**没有公开注册**：
1. 首次启动从 `.env.local` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 自动建唯一管理员（缺失则随机生成并写回）
2. 后续账号由管理员在 `/admin/members` 添加，可停用、可重置密码
3. 普通成员只能在"自己的空间"内增删改物品
4. 导入/导出 v1.0 **仅管理员**可用
5. 失败 5 次锁 10 分钟（计数存 `login_attempts` 表，防绕过 cookie）
6. 部署必须 HTTPS，否则 httpOnly + Secure cookie 失效
7. 错误信息统一"用户名或密码错误"防用户名枚举；用户不存在时也跑一次 bcrypt 防 timing 攻击

任何涉及路由保护、Server Actions 鉴权、`users` 表写入的代码都必须遵守这个模型。**不要加注册页面或公开注册接口**。

## 代码组织约定

```
src/
  app/
    (auth)/login/         # 登录页（page + actions）
    (app)/                # 登录后布局（顶栏 + 移动 Tab + 侧栏）
      page.tsx            # 仪表盘（ensureDefaultSpace + 统计）
      items/              # 物品（M2 才接）
      locations/          # 位置（5 级树 CRUD）
      categories/         # 分类 CRUD
      tags/               # 标签 CRUD
      admin/members/      # 仅管理员
  lib/
    db/                   # Drizzle schema + 实例（import "server-only"）
    auth/                 # JWT、密码、session、登录失败计数、bootstrap
    actions/              # Server Actions（每个一组 CRUD）
      types.ts            # 共享 ActionState 类型 + 常量（必须独立文件，见下）
      spaces.ts
      locations.ts        # 5 级深度校验 + 防循环
      categories.ts
      tags.ts
      members.ts          # 全部 requireAdmin
    validation/           # zod schemas（集中）
  components/
    ui/                   # shadcn 组件
    layout/               # 顶栏、侧栏、Tab
data/nage.db              # SQLite 数据库文件（gitignore）
public/uploads/           # M2 用户上传图片
scripts/                  # E2E 测试（test-http / test-crud / test-flow）
```

**写入优先用 Server Actions**；**只有需要外部访问（扫码、导入/导出下载）才用 Route Handlers**。

## Server Action 关键约束

1. **`"use server"` 文件只能导出 async 函数**。类型/常量必须放 `src/lib/actions/types.ts` 这种不带 `"use server"` 的文件
2. **每个 action 入口都 `await requireSession()`**（admin-only 的用 `requireAdmin()`）—— proxy.ts 只做乐观检查
3. **zod 校验** 入参（schema 集中在 `src/lib/validation/schemas.ts`）
4. **错误返回 `{ error: string }`，不 throw**；用 `revalidatePath()` 刷新
5. **任何 owner 校验都在 service 层做**（每个 action 自己查 DB 确认用户有权限，不依赖路由层）

## 移动端优先

- 移动端底部 5 Tab：首页 / 物品 / 位置 / 分类 / 标签（admin 在 PC 侧栏多"成员"和"数据"，移动端塞不下）
- PC 端左侧固定侧栏 + 右侧主区
- 同一组件用 Tailwind 响应式类适配，**不要写两套组件**
- 触控目标 ≥ 44×44px（用 shadcn 默认的 size）
- 暗黑模式 v1.1 才上，但样式用 shadcn 的 CSS variables 写

## 常用命令

```bash
# 开发
pnpm dev
# 构建 / 类型 / lint
pnpm build && pnpm typecheck && pnpm lint
# 数据库
pnpm db:push       # Drizzle schema → SQLite（直接推，不生成迁移）
pnpm db:studio     # Drizzle Studio GUI
pnpm db:generate   # 生成迁移文件（drizzle/）
# E2E 测试（dev server 需跑在 3000）
node node_modules/tsx/dist/cli.mjs scripts/test-http.ts
node node_modules/tsx/dist/cli.mjs scripts/test-crud.ts
node node_modules/tsx/dist/cli.mjs scripts/test-flow.ts
```

## 已知坑（已踩过）

- **"use server" 文件不能导出非 async 函数**：把 `ActionState` 类型和 `DEFAULT_SPACE_NAME` 常量移到独立的 `types.ts`
- **Server component 不能向 client component 传函数**（如 `icon: Home`）：传字符串 key，client 组件自己 import 图标并查表
- **`useSearchParams` 必须包在 `<Suspense>` 里**：否则 Next 16 build 会 fail
- **Radix `DialogTrigger` 用 `asChild` 不是 `render`**：shadcn radix-nova preset 还是旧 API
- **ESLint 新规则 `react-hooks/set-state-in-effect` 对 useActionState + 关闭 dialog 模式会误报**：`eslint.config.mjs` 已关掉
- **`server-only` 模块在 tsx 脚本里会抛错**：E2E 测试统一走 HTTP（手动签 JWT）+ better-sqlite3 直写 DB，不直接 import server actions
- **better-sqlite3 WAL 模式下 DB 文件被锁**：dev server 跑时手动 `rm data/nage.db*` 会报 "Device or resource busy"，需先停 server
- **不要硬编码 `cookie: 'nage_session=...'` 字面量到 client component**：cookie 操作只在 server side

## 增量开发守则

- **每完成一个 M 阶段才提交**（用户说"提交"再 git commit）
- **不要创建未在 PRD 出现的功能**——遇到"顺手优化"的诱惑时，先问
- **不要在文件里写 emoji**（用户没要求）
- **不要写注释解释"为什么用 for 循环"这种显然的代码**
- 数据库 schema 改了必须同步更新 `PRD.md` 的 §5
- 优先用 Server Components；只把需要交互/状态的部分标 `"use client"`
- 写完一段功能先 `pnpm typecheck` 和 `pnpm build`，再继续下一段

## 跨会话记忆

`C:\Users\Faninx\.claude\projects\C--Users-Faninx-Downloads-Nage\memory\MEMORY.md` 记录项目状态、用户偏好、已踩过的坑。每个新会话开始时先读它。
