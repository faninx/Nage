# v1.1.0 (2026-06-15) — 多用户 / 多空间协作

v1.0 把"个人 / 家庭轻量收纳"做完了。v1.1 把它升级成"小团队 / 家庭多人协作"——一个空间可以有多个成员，每个成员有不同角色。

## 🆕 新增

### 多空间（multi-space）

每个用户可建**多个**空间（家 / 公司 / 实验室……），空间间数据完全隔离：

- 首次登录自动建一个默认空间，名字 = `"{昵称}的空间"`
- 顶栏 Logo 右侧有一个**空间切换器**：点开看所有可访问空间 + 当前角色 Badge + 「当前」标记
- `users.last_space_id` 记着上次所在空间，下次登录直接落点
- 任何登录用户都可去 `/spaces/new` 建新空间，自动成为 owner

### 空间成员三档角色

| 角色 | 空间内权限 | 成员管理 | 空间设置 |
|---|---|---|---|
| **owner** | 全部（增删改物品/位置/分类/标签） | ✅ 邀请 / 改角色 / 移除 | ✅ 改名 / 删除 |
| **editor** | 增删改物品/位置/分类/标签 | ❌ | ❌ |
| **viewer** | 只读 | ❌ | ❌ |

- **空间设置页**（`/spaces/[id]/settings`，仅 owner）支持：
  - 成员管理：按用户名搜索（精确前缀匹配），邀请、改角色、移除
  - 改空间名
  - 删空间（带二次确认，**会清空该空间内所有位置 / 分类 / 标签 / 物品 / 图片**）
- **最后一名 owner 不可降级 / 不可移除**：server action 强一致保护，避免空间变孤儿
- **数据导入 / 导出权限放宽**：从 v1.0 仅管理员 → v1.1 该空间的 owner / editor 都可操作自己空间。viewer 仍然 403

### API 权限收紧

`/api/qr/*`、`/api/admin/export`、`/api/admin/import` 都按 `hasSpaceAccess(userId, spaceId, "viewer" | "editor")` 校验。**不持有该空间访问权 → 404**（不是 403，避免泄露存在性）。

## 🐛 修复

- **登录锁定的剩余时间显示 `NaN 分钟后再试`**：`login_attempts.locked_until` 列声明为 `integer mode='timestamp'`，但旧 SQL 写的是 `datetime(..., 'unixepoch')` 字符串。Drizzle 读出来拿不到有效时间。SQL 改成写整数秒，启动 `bootstrap` 顺手清一遍已经写脏的行
- **编辑物品保存图片不展示**：`ItemForm` 的 `onFileChange` 选完图后 `e.target.value = ""` 把刚写入的 `files` 数组抹掉了，提交时 formData 拿不到文件。`onFileChange` 不再清空 input
- **`A 'use server' file can only export async functions`**：`space-members.ts` 里几个 zod schema `export` 了出去。`"use server"` 文件只能导出 async 函数，去掉 `export`（schema 只在本文件用）

## 🗄 数据库

- 新表 `space_members (space_id, user_id, role, created_at)`，复合主键 + FK 级联删除 + `space_members_user_idx`
- 新列 `users.last_space_id`，FK → `spaces.id`，ON DELETE SET NULL
- 迁移 `drizzle/0003_flimsy_orphan.sql`（自动跑）
- 启动 `bootstrap.ts::backfillSpaceMembers` 幂等地给每个老空间补 `role='owner'` 的 member 行 + 修 `last_space_id`

## ✨ 没变

- 物品 / 位置 / 分类 / 标签的字段和操作 0 变化
- 反代配置 0 变化（v1.0.1 起反代就是 BYO）
- 镜像 tag 之外的所有功能 0 变化

## 🧪 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- E2E：`scripts/test-m7-multiuser.ts`（**12 步全过**）
  - schema 检查 → backfill → 准备用户 → editor 进 settings 应 403 → 邀请加 editor → editor 能看 / 看 settings 跳转 → owner 看到成员 → export/import owner 和 editor 200 + viewer 403 → QR 跨空间 404 → last-owner 约束

## 📦 升级指引

**源码用户**：

```bash
cd /opt/nage
git pull
git checkout v1.1.0
docker compose build app
docker compose up -d
```

启动时 `bootstrap` 会自动：
1. 跑 `0003_flimsy_orphan` 迁移（建 `space_members` 表 + 加 `users.last_space_id` 列）
2. 给每个老空间补 owner member 行
3. 给 `last_space_id = NULL` 的 user 修到他最早拥有的空间

**不需要任何手动 SQL**。

**ghcr.io 镜像用户**：

```bash
# 编辑 docker-compose.yml，把 image 改成 :1.1.0
docker compose pull
docker compose up -d
```

## 🚀 新部署

跟 v1.0.4 完全一致，参考 [DEPLOY.md](../../DEPLOY.md)。无配置层面变化。启动后会自动建管理员 + 自动跑迁移 + 自动 backfill。

## 🛣 下一步（v1.2 计划）

- 借出 / 归还流程（F13）
- 保质期增强：仪表盘「快过期」分组卡片（F14 收口）
- PWA 离线（F16）
- 多语言 i18n（F18）

## 📄 许可

GPL v3
