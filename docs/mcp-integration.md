# Nage MCP Server 接入文档

> 给需要把 Nage 数据接到 AI 客户端（Claude Desktop / Claude Code / Cursor / Cline / 自建 agent）的人 / 工具看的。
>
> **版本**：v1.3.0 起（M8 完整功能：read / write / scope / rate limit / resources / prompts）

---

## 30 秒接入

```json
// Claude Desktop / Cursor / Cline 的 mcp_servers 配置
{
  "mcpServers": {
    "nage": {
      "url": "https://your-nage.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer nage_mcp_<43 字符随机>"
      }
    }
  }
}
```

把 `<43 字符随机>` 换成你在 Nage **设置 → MCP 令牌** 页面生成的 token。

> 反代 / 公网 URL 必须在 Nage 的 `.env` 配 `PUBLIC_URL=https://your-nage.example.com`（QR 码和 MCP Origin 校验依赖它）。

---

## 端点

| 项 | 值 |
|---|---|
| URL | `https://<your-nage>/api/mcp` |
| 协议 | MCP Streamable HTTP（spec 2025-06-18） |
| 方法 | `POST`（GET / DELETE 返回 405） |
| Content-Type | `application/json` |
| Accept | 必须含 `application/json` + `text/event-stream`（spec 要求） |
| 响应 | `application/json`（不开 SSE 流） |

---

## 鉴权

### 双轨模式

| 方式 | 何时用 | 例子 |
|---|---|---|
| **JWT cookie** (`nage_session`) | 浏览器场景 / 已登录的 Web 用户 | 浏览器开发者工具自动带 |
| **Bearer token** (`Authorization: Bearer nage_mcp_<43 chars>`) | **MCP 客户端首选**（CLI / 桌面 app / 自建 agent） | `Authorization: Bearer nage_mcp_Ab3d...XyZ0` |

两种认证互斥优先级：先看 Bearer header，没有再看 cookie。都没带 → JSON-RPC `-32000` + HTTP 401。

### 生成 Bearer token

1. 登录 Nage
2. 顶栏头像 → **MCP 令牌**
3. 填名称（例："Claude Desktop on MBP"）+ 选**作用域**（只读 / 可写）→ **生成**
4. **立即复制**弹窗里的完整 token（关掉就再也看不到，只能重置）

> ⚠️ token 明文只在创建时返回一次。Nage 存的是 SHA-256 hash，丢了没法找回，只能撤销重发。

### Scope（作用域）

| Scope | 能调的工具 | 适用场景 |
|---|---|---|
| `reader` | 5 个只读 + 4 个 resources + 3 个 prompts | 自动分析 agent、查询助手 |
| `editor` | reader 全部 + 3 个写工具（create_item / update_item / delete_item） | 自动记账 agent、需要改数据的场景 |

**推荐原则**：默认发 `reader`。要让 AI 写数据才用 `editor`，且建议单独建一个 `editor` token 出事好撤销。

### Origin 校验（防 DNS rebinding）

按 MCP spec 强制：
- 无 `Origin` 头（CLI / SDK）→ 放行
- dev 模式 → `localhost` / `127.0.0.1` 任意端口放行
- 生产 → 必须与 `PUBLIC_URL` 同源

---

## 工具列表

**18 个工具**，全部需要传 `spaceId`（空间隔离，除了 `list_spaces`）。

### 空间工具

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `list_spaces()` | 列出 caller 有访问权的所有空间（含 role / isOwner / memberCount） | （无） |

> **首次连接必调** `list_spaces` 拿到 `spaceId`，否则其它工具的 `spaceId` 都不知道填几。

### Read 工具（reader + editor 都能调）

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `list_locations(spaceId)` | 返回该空间所有位置的**嵌套树**（含 itemCount） | `spaceId` |
| `list_categories(spaceId)` | 返回所有分类（扁平列表，含 itemCount） | `spaceId` |
| `list_tags(spaceId)` | 返回所有标签（扁平列表，含 itemCount） | `spaceId` |
| `search_items(spaceId, q?, categoryId?, locationId?, tagIds?, exp?, sort?, page?)` | 多条件搜索物品（分页 20/页） | `spaceId` |
| `get_item(spaceId, itemId)` | 单物品完整详情（名称/描述/数量/价格/位置/分类/图片数组/标签数组/过期时间） | `spaceId, itemId` |

**`search_items` 参数详解**：
- `q`：模糊匹配名称/描述（最长 100 字）
- `categoryId`：单值
- `locationId`：单值，**自动展开为该位置及所有子位置**
- `tagIds`：数组（OR 语义：含任一标签的物品）
- `exp`：`"all" | "expired" | "7d" | "30d"`（"7d" = 7 天内过期）
- `sort`：`"updated" | "name" | "created"`（默认 `updated`）
- `page`：从 1 开始

### Write 工具（**仅 editor**）

**所有 update_* 工具都是 partial update 语义**（M9.5+）：
- 字段不传 = 不变
- 字段传 `null` = 清空（适用于 `description` / `unit` / `categoryId` / `locationId` / `expiredAt` / `tagIds`）
- 字段传值 = 改

**物品（items）**：

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `create_item(spaceId, name, ...)` | 新建物品 | `spaceId, name, quantity` |
| `update_item(id, name?, quantity?, ...)` | **partial update**：只改传的字段 | `id` |
| `delete_item(id)` | 删除（不可恢复） | `id` |

**位置（locations）**：

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `create_location(spaceId, name, parentId?, description?)` | 新建位置（`parentId` 缺省 = 根） | `spaceId, name` |
| `update_location(id, name?, parentId?, description?)` | partial update | `id` |
| `delete_location(id)` | 删除（CASCADE 到子位置 + 清空 items.locationId） | `id` |

**分类（categories）**：

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `create_category(spaceId, name, icon?)` | 新建分类（`icon` 推荐单 emoji） | `spaceId, name` |
| `update_category(id, name?, icon?)` | partial update | `id` |
| `delete_category(id)` | 删除（items.categoryId 置 null） | `id` |

**标签（tags）**：

| 工具 | 用途 | 必填参数 |
|---|---|---|
| `create_tag(spaceId, name, color?)` | 新建标签（`color` 推荐 hex） | `spaceId, name` |
| `update_tag(id, name?, color?)` | partial update | `id` |
| `delete_tag(id)` | 删除（item_tags 关联自动 CASCADE） | `id` |

### partial update 示例

```ts
// 只改名：其他字段保持
await client.callTool({
  name: "update_item",
  arguments: { id: 123, name: "新名字" },
})

// 改分类 + 清空位置 + 改过期时间
await client.callTool({
  name: "update_item",
  arguments: {
    id: 123,
    categoryId: 5,
    locationId: null,         // 清空
    expiredAt: "2027-12-31T23:59:59.000Z",
  },
})

// 清空所有标签关联
await client.callTool({
  name: "update_item",
  arguments: { id: 123, tagIds: [] },
})

// 移动位置到根
await client.callTool({
  name: "update_location",
  arguments: { id: 45, parentId: null },
})
```

### `create_item` 完整参数（`update_item` 字段子集 + nullable）

```ts
{
  spaceId: number,             // create_item 必填
  name: string,               // 1-200 字
  quantity: number,            // ≥1
  description?: string,        // ≤5000 字
  unit?: string,               // ≤20 字
  price?: number | null,       // ≥0，最多 2 位小数
  categoryId?: number | null,
  locationId?: number | null,
  tagIds?: number[],           // 标签 ID 数组（create 时也接受空数组）
  expiredAt?: string,          // ISO 8601，如 "2027-01-01T00:00:00.000Z"
}
```

---

## Resources

MCP Resources 是只读的数据视图。AI 客户端可以"订阅"读特定 URI。

| URI | 内容 |
|---|---|
| `nage://items/{id}` | 单个物品详情 |
| `nage://spaces/{sid}/locations` | 该空间所有位置（扁平列表） |
| `nage://spaces/{sid}/tags` | 该空间所有标签 |
| `nage://spaces/{sid}/categories` | 该空间所有分类 |

**调用示例**（用 MCP Client SDK）：

```ts
const item = await client.readResource({ uri: "nage://items/123" })
// item.contents[0].text 是 JSON 字符串
const data = JSON.parse(item.contents[0].text)
```

资源 reader 同样走 hasSpaceAccess 鉴权：非成员读他人空间的 resource → `forbidden` 错误。

---

## Prompts

MCP Prompts 是预定义的消息模板，AI 客户端可以"调用 prompt"拿到结构化提示词。**Prompts 不会真正写数据**，只指引 AI 该调哪些 tool。

| Prompt | 参数 | 用途 |
|---|---|---|
| `audit_expiring_soon` | `spaceId, days=30` | 提示 AI 审计 N 天内即将过期的物品 |
| `find_item` | `spaceId, query` | 提示 AI 按关键词找物品 |
| `inventory_summary` | `spaceId` | 提示 AI 给空间整体汇总（数量、分布、残缺物品） |

**调用示例**：
```ts
const { messages } = await client.getPrompt({
  name: "audit_expiring_soon",
  arguments: { spaceId: 1, days: 7 },
})
// messages[0].content.text = "请帮我审计空间 1 中 7 天内即将过期的物品..."
```

---

## 错误码

| HTTP | JSON-RPC code | 含义 |
|---|---|---|
| 401 | `-32000` | 未认证（缺 cookie 或 token 不对） |
| 200 | `-32001` | 已认证但无该空间的 viewer 权限 |
| 200 | `-32002` | scope 不够（reader 调写工具） |
| 200 | `-32003` | 速率超限（含 `Retry-After` 头） |
| 200 | `-32602` | 入参 schema 验证失败 |
| 200 | `-32603` | 工具执行异常（如数据库错误） |
| 403 | — | Origin 不在白名单 |

工具执行错误的内容格式：
```json
{
  "result": {
    "content": [{"type": "text", "text": "无权操作该空间"}],
    "isError": true
  }
}
```

非工具调用（`tools/list` / 通知）的错误用 JSON-RPC 标准 `error` 字段：
```json
{"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "..."}}
```

---

## 速率限制

- 默认 **60 req/min / token**（cookie 也算一个虚拟 token）
- 配置：env `MCP_RATE_LIMIT_PER_MIN=120`（重启 dev server 生效）
- 不同 token / 不同 cookie 互相独立（一个 token 满不影响其他）
- 触发时响应 `Retry-After: <秒>` 头

---

## 客户端配置示例

### Claude Desktop（macOS / Windows）

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows）：

```json
{
  "mcpServers": {
    "nage": {
      "url": "https://nage.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer nage_mcp_Ab3d...XyZ0"
      }
    }
  }
}
```

### Claude Code（CLI）

```bash
# 一次性
claude mcp add --transport http nage https://nage.example.com/api/mcp \
  --header "Authorization: Bearer nage_mcp_Ab3d...XyZ0"

# 团队项目加到 .mcp.json
cat > .mcp.json <<EOF
{
  "mcpServers": {
    "nage": {
      "type": "http",
      "url": "https://nage.example.com/api/mcp",
      "headers": {"Authorization": "Bearer nage_mcp_Ab3d...XyZ0"}
    }
  }
}
EOF
```

### Cursor

`Settings → MCP → Add new global MCP server`：
- Name: `nage`
- Type: `http`
- URL: `https://nage.example.com/api/mcp`
- Headers: `Authorization: Bearer nage_mcp_...`

### Cline (VSCode)

`Cline → MCP Servers → Configure → settings.json`：
```json
{
  "mcpServers": {
    "nage": {
      "url": "https://nage.example.com/api/mcp",
      "headers": {"Authorization": "Bearer nage_mcp_Ab3d...XyZ0"}
    }
  }
}
```

### 自建 agent（用 MCP TypeScript SDK）

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const transport = new StreamableHTTPClientTransport(
  new URL("https://nage.example.com/api/mcp"),
  {
    requestInit: {
      headers: { Authorization: "Bearer nage_mcp_Ab3d...XyZ0" },
    },
  }
)

const client = new Client(
  { name: "my-agent", version: "0.1.0" },
  { capabilities: {} }
)
await client.connect(transport)

// 列工具
const { tools } = await client.listTools()

// 调工具
const result = await client.callTool({
  name: "search_items",
  arguments: { spaceId: 1, q: "充电宝" },
})
const data = JSON.parse(result.content[0].text)
```

---

## 常见问题

### Q: `MCP error -32000: Bad Request: Server not initialized`
SDK Client 没发 `initialize` 请求。多数情况是 SDK 版本过老（< 1.25）。升级 `@modelcontextprotocol/sdk` 到 `^1.29.0` 或更新。

### Q: `MCP error -32001: 无权访问该空间`
caller 的 token 对应的用户不是该空间的成员。`空间设置 → 成员` 加一下。

### Q: `MCP error -32002: 此操作需要更高的 MCP token scope`
caller 是 `reader` scope 但调了写工具。在 **MCP 令牌** 页删旧 token 重建 `editor` 的。

### Q: `MCP error -32003: 请求过于频繁`
触发速率限制。等 `Retry-After` 秒后重试；或联系管理员调高 `MCP_RATE_LIMIT_PER_MIN`。

### Q: token 泄露了怎么办
1. 登录 Nage → **MCP 令牌**
2. 找到对应 token → **撤销**（立即生效，所有用此 token 的客户端断开）
3. 重新生成一个
4. 更新所有客户端的 config

### Q: 能用同一 token 在多个设备上吗？
可以。token 没有设备绑定。但建议不同设备用不同 token（出事单独撤销）。

### Q: 怎么知道 token 在被谁用？
登录 Nage → **MCP 令牌** → 列表里看 `最后使用` 时间。如果不是你自己的访问 → 立即撤销。

---

## 性能 & 限制

- 单 token 速率：60 req/min（可配）
- 单物品图片：最多 9 张，每张 ≤ 10MB
- 单 token 名称：≤ 50 字
- 空间成员：无限（实际受 SQLite 性能限制）
- 导出格式：JSON（应用内导入/导出用，跟 MCP 工具返回值结构一致）
- 数据库：单文件 SQLite（`data/nage.db`）
- 上传文件：`data/uploads/`（M10 起从 public/ 迁出；不在静态服务范围）
- **图片 URL 需鉴权**（M10）：`/uploads/items/<id>/<idx>.jpg` 也需要 cookie 或 Bearer + viewer 权限
  - AI agent 想看图：直接 `fetch(url, { headers: { Authorization: 'Bearer nage_mcp_...' } })`
  - Web 浏览器：自动带 cookie，无需额外处理
  - 未授权 → 401；非空间成员 → 403；不存在 → 404；非 items 路径 → 404

---

## 给 AI agent 看的「速查卡」

如果你是 AI agent 要操作 Nage，**先读这段**：

1. **第一步先调 `list_spaces`** 拿 `spaceId`。其它工具都依赖 `spaceId`，但你启动时通常不知道。

2. **优先用 Resources**（只读 + 有缓存语义）而不是 `search_items`（每次都查 DB）。

3. **`update_*` 全部是 partial**：只传想改的字段。`null` = 清空（适用于 `description` / `unit` / `categoryId` / `locationId` / `expiredAt` / `tagIds`）。比如只改名：`{ id: 1, name: "新名字" }` 就够了。

4. **先 `get_item` 后 `update_item`**——读到的数据回传更新，不要凭空构造。

5. **不要假设 id 顺序**——用 `search_items` / `list_*` 拿 id。

6. **批量操作没有现成工具**——循环单条调用，注意 60 req/min 速率限制。

7. **错误时**先看 JSON-RPC error 的 code：
   - `-32000` → 重新拿 token
   - `-32001` → 问用户确认 spaceId
   - `-32002` → 提示用户升级到 editor token
   - `-32003` → 等 `Retry-After` 秒
   - `-32602` → 检查入参（zod 失败信息在 content 里）
   - `-32603` → 工具内部错，看 message
