# 纳格（Nage）

一个轻量、自托管的家庭 / 小团队物品收纳管理系统。

- **中文名**：纳格（拼音：Nà gé）
- **英文名**：Nage
- **栈**：Next.js 16 · React 19 · SQLite · Drizzle ORM · Tailwind v4 · shadcn/ui
- **鉴权**：管理员模式（无公开注册，账号由管理员后台创建）
- **部署**：Docker + Caddy，自动 HTTPS
- **数据库**：单文件 SQLite（`data/nage.db`）

## 快速开始（开发）

```bash
# 1. 装依赖
pnpm install

# 2. 复制环境变量模板
cp .env.local.example .env.local
# 首次启动会读 ADMIN_USERNAME / ADMIN_PASSWORD 自动建管理员
# 不填就随机生成并打印在控制台

# 3. 起开发服
pnpm dev
# 打开 http://localhost:3000
```

## E2E 测试

```bash
pnpm dev   # 另一个终端
node node_modules/tsx/dist/cli.mjs scripts/test-http.ts
node node_modules/tsx/dist/cli.mjs scripts/test-crud.ts
node node_modules/tsx/dist/cli.mjs scripts/test-flow.ts
node node_modules/tsx/dist/cli.mjs scripts/test-items.ts
```

## 部署到公网

> 完整文档：[DEPLOY.md](./DEPLOY.md)

1 台 VPS + Docker Compose + Caddy（自动 HTTPS）：

```bash
# 1. 准备：DNS 解析、装 Docker、复制代码到 /opt/nage
# 2. 配 .env（必须设 ADMIN_PASSWORD / JWT_SECRET / ACME_EMAIL）
# 3. 起
docker compose up -d --build
# 4. 等 Caddy 签完证书
docker compose logs -f caddy
# 看到 "obtained certificate" 后打开 https://你的域名
```

备份：

```bash
bash scripts/backup.sh         # 手动
# 0 3 * * * cd /opt/nage && bash scripts/backup.sh >> logs/backup.log 2>&1   # crontab
```

恢复：

```bash
docker compose stop app
docker exec -it nage-app bash /app/scripts/restore.sh
docker compose start app
```

## 项目结构

```
src/
  app/
    (auth)/login/         # 登录页
    (app)/                # 登录后布局（顶栏 + 移动 Tab + 侧栏）
      page.tsx            # 仪表盘
      items/              # 物品 CRUD
      locations/          # 位置（5 级树）
      categories/         # 分类
      tags/               # 标签
      admin/members/      # 成员管理（仅管理员）
      admin/data/         # 数据导入/导出（仅管理员）
  lib/
    db/                   # Drizzle schema + 实例
    auth/                 # JWT / 密码 / session / bootstrap
    actions/              # Server Actions（CRUD）
    validation/           # zod schemas
  components/
    ui/                   # shadcn 组件
    layout/               # 顶栏、侧栏、Tab、FAB
data/nage.db              # SQLite（gitignore）
public/uploads/           # 用户上传图片
scripts/                  # E2E 测试 + 备份/恢复
```

## 里程碑

- [x] **M1** 鉴权 + 空间/位置/分类/标签/成员 CRUD + UI 骨架
- [x] **M2** 物品 CRUD + 图片上传 + 搜索筛选
- [x] **M3** 借出/归还 + 保质期
- [x] **M4** 暗黑模式 + PWA
- [x] **M5** Docker 化 + 部署文档 + 备份脚本

## 详细规范

设计细节、数据模型、版本规划见 [PRD.md](./PRD.md)。
项目协作约束见 [CLAUDE.md](./CLAUDE.md)。
