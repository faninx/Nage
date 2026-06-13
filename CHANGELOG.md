# 更新日志

所有对项目有显著影响的变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.1] - 2026-06-14

### 变更

- **移除 Caddy 集成**：v1.0.0 把 Caddy 写进 `docker-compose.yml` + 项目根 `Caddyfile`。v1.0.1 起反代由用户自己解决,`docker-compose.yml` 只剩 `app` 一个 service。`Caddyfile` 移到 [`docs/examples/caddy/`](./docs/examples/caddy/) 当参考
- **新增反代示例**：[`docs/examples/`](./docs/examples/) 下加 Caddy / Nginx / Cloudflare Tunnel 三个方案,每个带 README + 配置文件
- **端口可配置**:`docker-compose.yml` 的主机端口用 `APP_PORT` 环境变量,默认 3000
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
