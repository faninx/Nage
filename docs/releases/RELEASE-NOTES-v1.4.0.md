# v1.4.0 (2026-07-02) — MCP Server 全套 + 安全加固

v1.2.1 之后最大的一次发版。**主线：MCP（Model Context Protocol）Server 能力从 0 到 18 个工具**。同时**修复一个 0day 鉴权绕过漏洞**（`/uploads/*` 无鉴权 → 任何人能枚举所有空间物品图）。

**新增 1 个 schema 改动**：`mcp_tokens.scope` 列（`reader` / `editor` 二档），migration `0005_eminent_avengers.sql` 自动应用。0 数据迁移（老 token 默认 `reader`）。

## 🎉 头号特性：MCP Server

让 AI 客户端（Claude Desktop / Cursor / Cline / Claude Code / 自建 agent）通过标准 MCP 协议读写 Nage 数据。

### 18 个工具

| 类别 | 工具 | 数 |
|---|---|---|
| 空间 | `list_spaces` | 1 |
| 读 | `list_locations` / `list_categories` / `list_tags` / `search_items` / `get_item` | 5 |
| 物品写 | `create_item` / `update_item` (partial) / `delete_item` | 3 |
| 位置写 | `create_location` / `update_location` (partial) / `delete_location` | 3 |
| 分类写 | `create_category` / `update_category` (partial) / `delete_category` | 3 |
| 标签写 | `create_tag` / `update_tag` (partial) / `delete_tag` | 3 |

外加 **4 个 Resource template**（`nage://items/{id}` + 3 个 `nage://spaces/{sid}/*`）和 **3 个 Prompt**（`audit_expiring_soon` / `find_item` / `inventory_summary`）。

### 双轨鉴权

| 方式 | 何时用 | 例子 |
|---|---|---|
| **JWT cookie** | 浏览器场景 / Web UI | 浏览器自动带 `nage_session` |
| **Bearer token** | **MCP 客户端首选** | `Authorization: Bearer nage_mcp_Ab3d...XyZ0` |

### Scope 二档

| Scope | 能调的写工具 | 适用 |
|---|---|---|
| `reader` | 5 读 + 4 resources + 3 prompts | 只读 agent / 数据查询 |
| `editor` | 上面 + 12 个写工具 | 自动记账 / 数据写入 |

### 速率限制

默认 60 req/min/token（cookie / Bearer 独立窗口）。env `MCP_RATE_LIMIT_PER_MIN=120` 可调。超限返 `Retry-After` 头 + JSON-RPC `-32003`。

### Partial Update 语义

所有 `update_*` 工具是 PATCH 而不是 PUT：
- 字段不传 → 不变
- 字段传 `null` → 清空（适用于 `description` / `unit` / `categoryId` / `locationId` / `expiredAt` / `tagIds`）
- 字段传值 → 改

```ts
// 只改名
{ id: 1, name: "新名字" }

// 清空位置 + 改过期
{ id: 1, locationId: null, expiredAt: "2027-12-31T23:59:59.000Z" }

// 移到根
{ id: 45, parentId: null }
```

完整接入文档：`docs/mcp-integration.md`（30 秒接入 + 工具表 + 5 个客户端配置示例 + 错误码 + 速查卡）。

## 🐛 安全修复（M10）

### `/uploads/*` 0day 鉴权绕过

**漏洞**：`/uploads/items/<itemId>/<idx>.jpg` **无任何鉴权**，加上 itemId 是自增的（1, 2, 3...），任何人可以枚举 `https://nage.example.com/uploads/items/1/1.jpg` 看到所有空间物品的图（收据、证件等敏感图片会泄露）。

**双重 bug**：
1. `proxy.ts` line 23 显式 `pathname.startsWith("/uploads/")` 短路了请求，next.config.ts 的 rewrite 永远不触发
2. `public/uploads/` 在 Next.js 静态服务根目录里，dev 模式下 Turbopack 直接静态服务（绕开任何 route handler）

**修复**：
- `public/uploads/` 整个目录迁到 `data/uploads/`（gitignore 已覆盖）
- `proxy.ts` 移除 `/uploads/` 短路（让 rewrite 触发）
- `/api/uploads/[...path]/route.ts` 加 `resolveMcpAuth()` + `hasSpaceAccess(viewer)` 校验
- `(itemId → spaceId)` LRU 缓存（5000 条上限；热图 0ms，冷图 ~3ms）
- `Cache-Control: private`（防止 CDN 共享泄露）

**修复后**：

| 场景 | 状态码 |
|---|---|
| 无 auth | 401 |
| 错 Bearer / 错 cookie | 401 |
| 已 auth 但非该空间成员 | 403 |
| 不存在 itemId | 404 |
| 非 `items/<id>/<file>` 路径 | 404 |
| path traversal（`../` 等） | 404 |
| 空间成员 | 200 + 文件 |

E2E 加 【8.9】section 覆盖 8 个断言（含 path traversal、跨空间、不存在路径等）。

## 🗄️ 数据库变更

```sql
-- drizzle/0005_eminent_avengers.sql
ALTER TABLE `mcp_tokens` ADD `scope` text DEFAULT 'reader' NOT NULL;
```

`bootstrap.ts` 的 `migrate()` 启动时自动应用，老的 `mcp_tokens` 行自动获得 `reader` scope（不破坏已有 token）。E2E 加了 `mcpCreateCategory` 等写工具的 scope 拒绝测试。

## 🛠️ 实现细节

### M8.2 踩坑：Drizzle SQLite timestamp mode

`integer(... mode: "timestamp")` 列用 `mapToDriverValue()` 转换值时：
- 传 `Date` 对象 → 不知为何存 null
- 传 `number`（秒）→ 抛 `value.getTime is not a function`

**解决**：用 `sql\`${Math.floor(d.getTime() / 1000)}\`` raw param 绕开 Drizzle 转换层。

### M8.2 踩坑：MCP SDK 调 handler 顺序

SDK 调 tool handler 之前先做 schema 校验（缺必填字段在 -32602 阶段就拒了），所以 scope 检查走不到 —— 测写工具拒绝时必须传全字段才能触发 -32002。

### M8.3 踩坑：MCP SDK 响应 shape

tool call 错误必须用 `result: { content, isError }` 包裹（不能用 top-level `error`，SDK 的 zod schema 不认）。Rate limit 走 tool-shaped error 路径。

### M9.5 实现：保留 "key 是否传入" 语义

`z.optional()` 区分不了「key 缺失」和「key: undefined」（两者都变 undefined）。实现 partial update 用 `('key' in raw)` 判断显式传了哪些 key。

## 📊 数据

- **新增文件**：MCP server 6 个 + actions 4 个 + 工具定义 + 文档 = 约 15 个新文件
- **E2E 扩**：从 M8.1 的 8 sections / 30+ 断言 → 现在 11 sections / 70+ 断言
- **commit 数**（自 v1.2.1）：11 个 feat/docs/test commits
  - M8.1.x：5 个
  - M8.2：1 个
  - M8.3：1 个
  - M8.4：1 个
  - M8.5：1 个
  - M9 + M10：3 个
  - 文档 + E2E：3 个

## 🐛 其他改进

- Settings UI：MCP 令牌弹窗从「关闭按钮 + 复制按钮」重构为「token 框内嵌复制按钮 + 普通关闭」标准模式（用户反馈后修）
- 关闭按钮文案：`关闭` → `已保存，关闭`（更明确的状态反馈）
- CLAUDE.md 加 M8 / M9 / M10 各章的 known-pitfall 段

## 🔮 暂未做的（M8.5+ 计划内的）

写在本节让用户知道哪些是「计划内未做」vs「真没做」：

- **写工具的图片上传**（`add_image` 走 base64 / URL）：跳到 M8.3+ 之后做（M9 没加）
- **Resources 的 `list()`**：现在 list 只能列模板 URI 模式，具体资源要按需读
- **SSE 流响应 / server-initiated 通知**：M8.5 评估后暂不开启（开的话要 transport 跨请求缓存，复杂度上升）
- **多 worker 部署的 ALS + Redis 共享 rate limit**：M8.3 留作 M8.5+；M8.5 用了 ALS 但还没切 Redis

## 📦 升级指引

```bash
cd /opt/nage
git fetch origin
git checkout v1.4.0
docker compose pull
docker compose up -d

# bootstrap.ts 启动时自动跑 migrate()，加 mcp_tokens.scope 列
# 老 mcp_tokens 行的 scope 默认 'reader'（继续可读，写工具会拒绝）
# 已有 Bearer token 仍然有效（哈希匹配）
```

**无破坏性变更**（仅 schema 增列、默认值兜底）。但建议：

- 想用写工具的 agent：撤销旧 token 重新生成 `editor` scope
- 自托管反代后公网部署：图片鉴权修复后，原有 `<img src="/uploads/...">` 自动带 cookie 正常工作

## 📚 文档

- **`docs/mcp-integration.md`**：MCP 完整接入文档（30 秒接入 + 工具/资源/prompt 参考 + 5 个客户端配置 + 错误码 + AI agent 速查卡）
- **`docs/releases/RELEASE-NOTES-v1.4.0.md`**：本文件
- **`CHANGELOG.md`**：完整变更日志
- **`CLAUDE.md`**：开发协作规范（加 M8/M9/M10 known-pitfall 段）
- **`PRD.md`** §10：里程碑表更新（M8.1 / M8.2-5 / M9 / M10）

## 🧪 验证

```bash
# 完整 E2E（需要 dev server 跑在 :3000）
node node_modules/tsx/dist/cli.mjs scripts/test-mcp.ts

# 包含 11 sections / 70+ 断言：
# - M8.1 schema/auth/tools/list
# - M8.2 write tools + scope
# - M8.3 rate limit
# - M8.4 Resources + Prompts
# - M9.1 list_spaces
# - M9.2-4 location/category/tag CRUD
# - M9.5 items partial update
# - M10 uploads 鉴权（8 个新断言）
```

CI 也会跑（`.github/workflows/docker-publish.yml` 推送 tag 触发）：多架构镜像 → `ghcr.io/faninx/nage:1.4.0` + `faninx/nage:1.4.0`。
