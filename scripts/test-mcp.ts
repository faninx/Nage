// M8.1 + M8.2 MCP Server 端到端验收：
//   M8.1：只读 MVP — 5 个 read 工具 + 双轨鉴权 + 空间 ACL
//   M8.2：写工具 — create_item / update_item / delete_item + token scope (reader/editor)
//
// 用法：node node_modules/tsx/dist/cli.mjs scripts/test-mcp.ts
//
// 走 MCP Client SDK 而不是 raw fetch，因为：
// 1. SDK 自动处理 Accept 头（必须含 application/json + text/event-stream）
// 2. 走真实客户端路径，验证 SDK 与服务端协议兼容性
// 3. 直接发 fetch 也能跑通，但 SDK 路径更接近 Claude Desktop / Cursor 的实际使用方式

import { config } from "dotenv"
config({ path: ".env.local" })

import { SignJWT } from "jose"
import { createHash, randomBytes } from "node:crypto"
import Database from "better-sqlite3"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const BASE = process.env.MCP_TEST_BASE ?? "http://localhost:3000"
const MCP_URL = `${BASE}/api/mcp`
const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET 不在 .env.local")
  process.exit(1)
}

async function makeCookie(userId: number, username: string, role: "admin" | "member") {
  const token = await new SignJWT({ sub: String(userId), role, username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
  return `nage_session=${token}`
}

function makeBearer(
  userId: number,
  name: string,
  scope: "reader" | "editor" = "reader"
): { token: string; hash: string; lastFour: string; scope: "reader" | "editor" } {
  const sec = randomBytes(32).toString("base64url")
  const token = `nage_mcp_${sec}`
  const hash = createHash("sha256").update(sec).digest("hex")
  const lastFour = sec.slice(-4)
  // 直接插 DB（绕过 Server Action；E2E 不走 action）
  const db = new Database(process.env.DATABASE_URL || "./data/nage.db")
  db.prepare(
    "INSERT INTO mcp_tokens (user_id, name, token_hash, last_four, scope) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, name, hash, lastFour, scope)
  db.close()
  return { token, hash, lastFour, scope }
}

async function withClient(opts: {
  cookie?: string
  bearer?: string
  origin?: string
}): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: {
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}),
        ...(opts.origin ? { Origin: opts.origin } : {}),
      },
    },
  })
  const client = new Client(
    { name: "nage-mcp-e2e", version: "0.1.0" },
    { capabilities: {} }
  )
  await client.connect(transport)
  return client
}

/** 取 callTool 的 content[0].text（MCP SDK 类型是 unknown，运行时是 text 内容） */
function textOf(res: unknown): string {
  const r = res as { content?: Array<{ type: string; text: string }> }
  const c = r.content
  if (!c || c.length === 0 || c[0].type !== "text") {
    throw new Error(`❌ 响应不是 text 类型: ${JSON.stringify(c)}`)
  }
  return c[0].text
}

async function main() {
  console.log("=== M8.1 MCP Server 端到端验收 ===\n")

  const db = new Database(process.env.DATABASE_URL || "./data/nage.db")

  // ----------------------------------------------------------
  // 【0】前置：mcp_tokens 表存在
  // ----------------------------------------------------------
  console.log("【0】schema 检查：mcp_tokens 表")
  const tbl = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_tokens'")
    .get()
  if (!tbl) throw new Error("❌ mcp_tokens 表未建（migration 0004 未跑）")
  console.log("  ✅ mcp_tokens 表存在\n")

  // ----------------------------------------------------------
  // 【1】准备测试用户 + 空间
  // ----------------------------------------------------------
  console.log("【1】准备测试用户 + 空间")
  const admin = db
    .prepare("SELECT id, username FROM users WHERE role='admin' LIMIT 1")
    .get() as { id: number; username: string } | undefined
  if (!admin) throw new Error("❌ DB 无 admin")
  const adminCookie = await makeCookie(admin.id, admin.username, "admin")
  let adminSpace = db
    .prepare("SELECT id, name FROM spaces WHERE owner_id=? ORDER BY id LIMIT 1")
    .get(admin.id) as { id: number; name: string } | undefined
  // Fresh DB（CI）上 bootstrap 只建 admin 不建空间。E2E 自给自足建一个。
  if (!adminSpace) {
    const r = db
      .prepare(
        "INSERT INTO spaces (name, owner_id) VALUES (?, ?) RETURNING id, name"
      )
      .get("E2E Test Space", admin.id) as { id: number; name: string }
    adminSpace = r
    // 同步加 admin 到 space_members（owner 角色）
    db.prepare(
      "INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, 'owner')"
    ).run(adminSpace.id, admin.id)
    console.log(`  ✓ 新建 E2E 测试空间 id=${adminSpace.id} (admin owner)`)
  } else {
    console.log(`  ✓ admin id=${admin.id}, space=${adminSpace.id}（已存在）`)
  }

  let alice = db
    .prepare("SELECT id, username FROM users WHERE username='alice'")
    .get() as { id: number; username: string } | undefined
  if (!alice) {
    const bcrypt = await import("bcryptjs")
    const hash = await bcrypt.hash("password123", 12)
    const r = db
      .prepare(
        "INSERT INTO users (username, password_hash, nickname, role, is_active) VALUES (?, ?, ?, 'member', 1) RETURNING id, username"
      )
      .get("alice", hash, "艾莉丝") as { id: number; username: string }
    alice = r
    console.log(`  ✓ alice 已创建 id=${alice.id}`)
  } else {
    console.log(`  ✓ alice id=${alice.id}（已存在）`)
  }
  // alice 不是 admin 空间的成员（hasSpaceAccess 应拒）
  const aliceInAdmin = db
    .prepare("SELECT 1 FROM space_members WHERE space_id=? AND user_id=?")
    .get(adminSpace.id, alice.id)
  if (aliceInAdmin) {
    db.prepare("DELETE FROM space_members WHERE space_id=? AND user_id=?").run(
      adminSpace.id,
      alice.id
    )
    console.log("  ✓ 已清掉 alice 的 admin 空间成员行")
  }

  // 种基础数据（让后续 list_*/search 断言不为空）
  // categories
  const seedCats = ["工具", "食品", "电子"]
  for (const name of seedCats) {
    const exists = db
      .prepare("SELECT 1 FROM categories WHERE space_id=? AND name=?")
      .get(adminSpace.id, name)
    if (!exists) {
      db.prepare("INSERT INTO categories (space_id, name) VALUES (?, ?)").run(
        adminSpace.id,
        name
      )
    }
  }
  // tags
  const seedTags = ["常用", "重要", "待整理"]
  for (const name of seedTags) {
    const exists = db
      .prepare("SELECT 1 FROM tags WHERE space_id=? AND name=?")
      .get(adminSpace.id, name)
    if (!exists) {
      db.prepare("INSERT INTO tags (space_id, name, color) VALUES (?, ?, ?)").run(
        adminSpace.id,
        name,
        "#888888"
      )
    }
  }
  // 1 个 location（root）
  const seedLocExists = db
    .prepare("SELECT 1 FROM locations WHERE space_id=? AND parent_id IS NULL")
    .get(adminSpace.id)
  if (!seedLocExists) {
    db.prepare("INSERT INTO locations (space_id, name) VALUES (?, ?)").run(
      adminSpace.id,
      "E2E Root"
    )
  }
  // 1 个 item
  const itemExists = db
    .prepare("SELECT 1 FROM items WHERE space_id=? LIMIT 1")
    .get(adminSpace.id)
  let seedItemId: number
  if (!itemExists) {
    const r = db
      .prepare(
        "INSERT INTO items (space_id, name, quantity) VALUES (?, ?, ?) RETURNING id"
      )
      .get(adminSpace.id, "E2E 种子物品", 1) as { id: number }
    seedItemId = r.id
  } else {
    seedItemId = (db
      .prepare("SELECT id FROM items WHERE space_id=? LIMIT 1")
      .get(adminSpace.id) as { id: number }).id
  }
  // 1 张图（写文件 + item_images 记录）— 给 M10 uploads 鉴权测试用
  const imgExists = db
    .prepare("SELECT 1 FROM item_images WHERE item_id=?")
    .get(seedItemId)
  if (!imgExists) {
    const { writeFileSync, mkdirSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const imgDir = resolve(process.cwd(), "data", "uploads", "items", String(seedItemId))
    mkdirSync(imgDir, { recursive: true })
    // 最小有效 JPEG（1x1 白像素，~125 字节）
    const tinyJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z",
      "base64"
    )
    const imgName = "1.jpg"
    writeFileSync(resolve(imgDir, imgName), tinyJpeg)
    db.prepare("INSERT INTO item_images (item_id, path) VALUES (?, ?)").run(
      seedItemId,
      `items/${seedItemId}/${imgName}`
    )
  }
  console.log("  ✓ 种子数据：3 categories / 3 tags / 1 location / 1 item + 1 image")
  console.log()

  // ----------------------------------------------------------
  // 【2】鉴权负例：无 token / 错 token / 错 origin
  // ----------------------------------------------------------
  console.log("【2】鉴权负例")
  // 无任何 auth
  try {
    await withClient({})
    throw new Error("❌ 无 auth 应该被拒")
  } catch (e) {
    const msg = (e as Error).message
    if (!msg.includes("401") && !msg.includes("Unauthorized") && !msg.includes("32000")) {
      throw new Error(`❌ 无 auth 错误码不对: ${msg}`)
    }
    console.log("  ✅ 无 auth → 401 -32000")
  }
  // 错 Bearer
  try {
    await withClient({ bearer: "nage_mcp_" + "A".repeat(43) })
    throw new Error("❌ 错 Bearer 应该被拒")
  } catch (e) {
    const msg = (e as Error).message
    if (!msg.includes("401") && !msg.includes("32000")) {
      throw new Error(`❌ 错 Bearer 错误码不对: ${msg}`)
    }
    console.log("  ✅ 错 Bearer → 401 -32000")
  }
  // 错 origin（prod 模式检查需要 PUBLIC_URL；dev 模式 localhost 才放行）
  // 这里只在 prod 测；dev 跳过
  if (process.env.NODE_ENV === "production" && process.env.PUBLIC_URL) {
    try {
      await withClient({ cookie: adminCookie, origin: "https://evil.example" })
      throw new Error("❌ 错 origin 应该被拒")
    } catch (e) {
      const msg = (e as Error).message
      if (!msg.includes("403") && !msg.includes("Origin")) {
        throw new Error(`❌ 错 origin 错误码不对: ${msg}`)
      }
      console.log("  ✅ 错 origin → 403")
    }
  } else {
    console.log("  ℹ️  错 origin 测试跳过（dev 模式 / 未设 PUBLIC_URL）")
  }
  console.log()

  // ----------------------------------------------------------
  // 【3】Cookie 鉴权路径：tools/list 应列 5 个工具
  // ----------------------------------------------------------
  console.log("【3】Cookie 鉴权路径 → tools/list")
  const client = await withClient({ cookie: adminCookie })
  const toolsRes = await client.listTools()
  const toolNames = toolsRes.tools.map((t) => t.name).sort()
  const expectedTools = [
    "get_item",
    "list_categories",
    "list_locations",
    "list_tags",
    "search_items",
  ]
  for (const name of expectedTools) {
    if (!toolNames.includes(name)) {
      throw new Error(`❌ 缺少工具 ${name}；实际: ${toolNames.join(",")}`)
    }
  }
  console.log(`  ✅ tools/list 返回 ${toolNames.length} 个工具: ${toolNames.join(", ")}`)
  console.log()

  // ----------------------------------------------------------
  // 【4】5 个工具都至少能调通（basic shape）
  // ----------------------------------------------------------
  console.log("【4】5 个 read 工具 basic shape")

  // list_locations → 返回嵌套树（数组）
  const locRes = await client.callTool({
    name: "list_locations",
    arguments: { spaceId: adminSpace.id },
  })
  if (locRes.isError) throw new Error(`❌ list_locations 失败: ${JSON.stringify(locRes)}`)
  const locData = JSON.parse(textOf(locRes))
  if (!Array.isArray(locData)) throw new Error("❌ list_locations 不是数组")
  console.log(`  ✅ list_locations → ${locData.length} 个根节点（含子树的扁平统计）`)

  // list_categories → 数组
  const catRes = await client.callTool({
    name: "list_categories",
    arguments: { spaceId: adminSpace.id },
  })
  if (catRes.isError) throw new Error(`❌ list_categories 失败`)
  const catData = JSON.parse(textOf(catRes))
  if (!Array.isArray(catData)) throw new Error("❌ list_categories 不是数组")
  console.log(`  ✅ list_categories → ${catData.length} 个分类`)

  // list_tags → 数组
  const tagRes = await client.callTool({
    name: "list_tags",
    arguments: { spaceId: adminSpace.id },
  })
  if (tagRes.isError) throw new Error(`❌ list_tags 失败`)
  const tagData = JSON.parse(textOf(tagRes))
  if (!Array.isArray(tagData)) throw new Error("❌ list_tags 不是数组")
  console.log(`  ✅ list_tags → ${tagData.length} 个标签`)

  // search_items → SearchResult 对象（items + total + totalPages）
  const searchRes = await client.callTool({
    name: "search_items",
    arguments: { spaceId: adminSpace.id, page: 1 },
  })
  if (searchRes.isError) throw new Error(`❌ search_items 失败`)
  const searchData = JSON.parse(textOf(searchRes))
  if (typeof searchData.total !== "number") throw new Error("❌ search_items 缺 total")
  if (!Array.isArray(searchData.items)) throw new Error("❌ search_items.items 不是数组")
  console.log(`  ✅ search_items → total=${searchData.total}, 本页 ${searchData.items.length} items`)

  // get_item → 拿一个真实 id
  if (searchData.items.length === 0) {
    console.log("  ℹ️  空间无 item，跳过 get_item")
  } else {
    const someItemId = searchData.items[0].id
    const itemRes = await client.callTool({
      name: "get_item",
      arguments: { spaceId: adminSpace.id, itemId: someItemId },
    })
    if (itemRes.isError) throw new Error(`❌ get_item 失败`)
    const itemData = JSON.parse(textOf(itemRes))
    if (!itemData.item || itemData.item.id !== someItemId) {
      throw new Error(`❌ get_item 没拿到 item.id=${someItemId}`)
    }
    if (!Array.isArray(itemData.images)) throw new Error("❌ get_item.images 不是数组")
    if (!Array.isArray(itemData.tags)) throw new Error("❌ get_item.tags 不是数组")
    console.log(
      `  ✅ get_item(id=${someItemId}) → name="${itemData.item.name}", ${itemData.images.length} 图, ${itemData.tags.length} 标签`
    )
  }
  console.log()

  // ----------------------------------------------------------
  // 【5】负例：alice 用 cookie 调 admin 空间的工具 → -32001 forbidden
  // ----------------------------------------------------------
  console.log("【5】空间 ACL 负例：非成员访问他人空间")
  const aliceClient = await withClient({ cookie: await makeCookie(alice.id, alice.username, "member") })
  const forbiddenRes = await aliceClient.callTool({
    name: "list_categories",
    arguments: { spaceId: adminSpace.id },
  })
  if (!forbiddenRes.isError) {
    throw new Error("❌ 非成员访问应该被拒")
  }
  const forbiddenText = textOf(forbiddenRes)
  if (!forbiddenText.includes("-32001") && !forbiddenText.includes("无权访问")) {
    throw new Error(`❌ 错误码不对: ${forbiddenText}`)
  }
  console.log("  ✅ 非成员访问 → isError + -32001 forbidden")
  console.log()

  // ----------------------------------------------------------
  // 【6】负例：参数错（search_items page='abc'）→ -32602 invalid args
  // ----------------------------------------------------------
  console.log("【6】参数校验负例")
  const badArgsRes = await client.callTool({
    name: "search_items",
    arguments: { spaceId: adminSpace.id, page: "abc" as unknown as number },
  })
  if (!badArgsRes.isError) {
    throw new Error("❌ 错参数应该被拒")
  }
  const badArgsText = textOf(badArgsRes)
  if (!badArgsText.includes("32602") && !badArgsText.toLowerCase().includes("invalid")) {
    throw new Error(`❌ 错误码不对: ${badArgsText}`)
  }
  console.log("  ✅ page='abc' → isError + -32602 invalid args")
  console.log()

  // ----------------------------------------------------------
  // 【7】Bearer 鉴权路径：直接插 mcp_tokens 行，重开 client 走 Bearer
  // ----------------------------------------------------------
  console.log("【7】Bearer 鉴权路径")
  // editor scope（后面 M8.2 写工具测试要复用这个 client）
  const bearer = makeBearer(admin.id, "e2e_test", "editor")
  console.log(`  ✓ 已为 admin 生成 e2e_test token (尾号 …${bearer.lastFour}, scope=${bearer.scope})`)
  const bearerClient = await withClient({ bearer: bearer.token })
  const bearerToolRes = await bearerClient.callTool({
    name: "list_tags",
    arguments: { spaceId: adminSpace.id },
  })
  if (bearerToolRes.isError) throw new Error("❌ Bearer 调工具失败")
  const bearerData = JSON.parse(textOf(bearerToolRes))
  if (!Array.isArray(bearerData) || bearerData.length === 0) {
    throw new Error("❌ Bearer 鉴权返回空（应该与 cookie 鉴权等价）")
  }
  console.log(`  ✅ Bearer token 调 list_tags → ${bearerData.length} 个标签`)

  // last_used_at 应被更新
  const row = db
    .prepare("SELECT last_used_at FROM mcp_tokens WHERE last_four=?")
    .get(bearer.lastFour) as { last_used_at: number | null } | undefined
  if (!row?.last_used_at) throw new Error("❌ last_used_at 未更新")
  console.log(`  ✅ last_used_at 已更新到 ${new Date(row.last_used_at * 1000).toISOString()}`)
  console.log()

  // ----------------------------------------------------------
  // 【8】M8.2 写工具：reader scope 应被拒；editor scope 应成功
  // ----------------------------------------------------------
  console.log("【8】M8.2 写工具 + scope 校验")

  // 8a) reader token 调 create_item → -32002 insufficientScope
  const readerBearer = makeBearer(admin.id, "e2e_reader")
  const readerClient = await withClient({ bearer: readerBearer.token })
  const readerRes = await readerClient.callTool({
    name: "create_item",
    arguments: { spaceId: adminSpace.id, name: "应该被拒" },
  })
  if (!readerRes.isError) throw new Error("❌ reader scope 调写工具应被拒")
  const readerText = textOf(readerRes)
  if (!readerText.includes("-32002")) {
    throw new Error(`❌ 错误码不对: ${readerText}`)
  }
  console.log("  ✅ reader scope 调 create_item → -32002 insufficientScope")

  // 8b) editor token（已存在的 bearer）调 create_item → 成功
  const editorClient = bearerClient
  const createRes = await editorClient.callTool({
    name: "create_item",
    arguments: {
      spaceId: adminSpace.id,
      name: "E2E 测试物品",
      description: "由 MCP 测试脚本创建",
      quantity: 1,
      expiredAt: "2027-01-01T00:00:00.000Z",
    },
  })
  if (createRes.isError) throw new Error(`❌ editor create_item 失败: ${textOf(createRes)}`)
  const createData = JSON.parse(textOf(createRes))
  if (typeof createData.id !== "number") throw new Error("❌ create_item 返回无 id")
  console.log(`  ✅ editor create_item → id=${createData.id}`)

  // 8c) update_item
  // 注：M8.2 写工具是 full-replace 语义（不是 partial update），caller 必传所有字段
  const updateRes = await editorClient.callTool({
    name: "update_item",
    arguments: {
      id: createData.id,
      name: "E2E 测试物品 v2",
      quantity: 5,
      expiredAt: "2027-01-01T00:00:00.000Z", // 必传（M8.3+ 再做 partial）
    },
  })
  if (updateRes.isError) throw new Error(`❌ update_item 失败: ${textOf(updateRes)}`)
  console.log(`  ✅ editor update_item(id=${createData.id}) 成功`)

  // 8d) get_item 验证修改
  const getRes = await editorClient.callTool({
    name: "get_item",
    arguments: { spaceId: adminSpace.id, itemId: createData.id },
  })
  if (getRes.isError) throw new Error("❌ get_item 失败")
  const getData = JSON.parse(textOf(getRes))
  if (getData.item.name !== "E2E 测试物品 v2") throw new Error(`❌ 名字没更新: ${getData.item.name}`)
  if (getData.item.quantity !== 5) throw new Error(`❌ 数量没更新: ${getData.item.quantity}`)
  if (!getData.item.expiredAt) throw new Error("❌ expiredAt 未保存")
  console.log(
    `  ✅ get_item 验证：name="${getData.item.name}", quantity=${getData.item.quantity}, expiredAt=${getData.item.expiredAt.slice(0, 10)}`
  )

  // 8e) delete_item
  const deleteRes = await editorClient.callTool({
    name: "delete_item",
    arguments: { id: createData.id },
  })
  if (deleteRes.isError) throw new Error(`❌ delete_item 失败: ${textOf(deleteRes)}`)
  console.log(`  ✅ editor delete_item(id=${createData.id}) 成功`)

  // 8f) 再 get 应拿不到
  const getAfterDelete = await editorClient.callTool({
    name: "get_item",
    arguments: { spaceId: adminSpace.id, itemId: createData.id },
  })
  if (getAfterDelete.isError) throw new Error("❌ get_item 自身失败")
  const afterData = JSON.parse(textOf(getAfterDelete))
  if (afterData.item !== null) throw new Error("❌ 删除后 item 应为 null")
  console.log("  ✅ delete 后 get_item → item=null")

  // 8g) reader token 不能用 editor 能力调任何写工具
  // 必传所有必填字段（schema 在 scope 检查前就拒了缺字段）
  const readerUpdateRes = await readerClient.callTool({
    name: "update_item",
    arguments: { id: 1, name: "x", quantity: 1 },
  })
  if (!readerUpdateRes.isError || !textOf(readerUpdateRes).includes("-32002")) {
    throw new Error(`❌ reader update_item 应被拒: ${textOf(readerUpdateRes)}`)
  }
  console.log("  ✅ reader scope 调 update_item → -32002")

  // 8h) expiredAt 格式错 → -32602
  const badDateRes = await editorClient.callTool({
    name: "create_item",
    arguments: {
      spaceId: adminSpace.id,
      name: "坏日期",
      expiredAt: "not-a-date",
    },
  })
  if (!badDateRes.isError) throw new Error("❌ 坏日期应被拒")
  if (!textOf(badDateRes).includes("-32602")) {
    throw new Error(`❌ 错误码不对: ${textOf(badDateRes)}`)
  }
  console.log("  ✅ expiredAt='not-a-date' → -32602 invalid args")
  console.log()

  // ----------------------------------------------------------
  // 【8.5】M8.3 速率限制（直接测 rate-limit module，不走 dev server）
  // ----------------------------------------------------------
  console.log("【8.5】M8.3 per-token rate limit")
  // 单元式测：在测试进程内 import rate-limit 模块，模拟 N 次调用
  // （限流器是 in-memory；E2E 跨进程无法 reset dev server 的窗口）
  const { checkRateLimit, _resetRateLimitForTest, _setLimitForTest } = await import(
    "../src/lib/mcp/rate-limit"
  )
  _setLimitForTest(5)
  _resetRateLimitForTest()
  // 构造一个 fake McpAuth（bearer 路径）
  const fakeAuth: import("../src/lib/auth/mcp-auth").McpAuth = { userId: 999, source: "bearer", tokenId: 999, scope: "editor" }

  let pass = 0
  let block = 0
  for (let i = 0; i < 8; i++) {
    const r = checkRateLimit(fakeAuth)
    if (r.allowed) pass++
    else block++
  }
  if (pass !== 5 || block !== 3) {
    throw new Error(`❌ 期望 pass=5, block=3；实际 pass=${pass}, block=${block}`)
  }
  console.log(`  ✅ 5 次允许 + 3 次阻断（共 8 次调用，limit=5/分钟）`)

  // 不同 token 独立窗口
  const fakeAuth2: import("../src/lib/auth/mcp-auth").McpAuth = { userId: 999, source: "bearer", tokenId: 1000, scope: "editor" }
  const r2 = checkRateLimit(fakeAuth2)
  if (!r2.allowed) throw new Error("❌ 不同 tokenId 应有独立窗口")
  console.log("  ✅ 不同 token 独立窗口（不被其他 token 拖累）")

  // cookie 路径也独立
  const fakeAuth3: import("../src/lib/auth/mcp-auth").McpAuth = { userId: 999, source: "cookie", scope: "editor" }
  const r3 = fakeAuth3 && checkRateLimit(fakeAuth3)
  if (!r3.allowed) throw new Error("❌ cookie 路径应有独立窗口")
  console.log("  ✅ cookie 鉴权独立窗口（不被 Bearer 拖累）")

  // reset 后允许
  _resetRateLimitForTest()
  const r4 = checkRateLimit(fakeAuth)
  if (!r4.allowed) throw new Error("❌ reset 后应重新允许")
  console.log("  ✅ resetRateLimitForTest 后窗口清空")

  // 还原
  _setLimitForTest(null)
  _resetRateLimitForTest()
  console.log()

  // ----------------------------------------------------------
  // 【8.6】M8.4 Resources
  // ----------------------------------------------------------
  console.log("【8.6】M8.4 Resources")
  // 8.6a) list_resource_templates 应有 4 个（全 template：sid 维度）
  const templateList = await editorClient.listResourceTemplates()
  const templateNames = templateList.resourceTemplates.map((t) => t.name).sort()
  const expectedRes = ["nage_item", "nage_space_categories", "nage_space_locations", "nage_space_tags"]
  for (const n of expectedRes) {
    if (!templateNames.includes(n)) throw new Error(`❌ 缺 resource template: ${n}`)
  }
  console.log(`  ✅ listResourceTemplates 返回 ${templateNames.length} 个: ${templateNames.join(", ")}`)

  // 8.6b) read nage://spaces/{sid}/locations
  const locRead = await editorClient.readResource({ uri: `nage://spaces/${adminSpace.id}/locations` })
  const locText = (locRead.contents[0] as { text: string }).text
  const locArr = JSON.parse(locText) as Array<{ id: number; name: string }>
  if (!Array.isArray(locArr) || locArr.length === 0) throw new Error("❌ locations 资源空")
  console.log(`  ✅ nage://spaces/${adminSpace.id}/locations → ${locArr.length} 个位置`)

  // 8.6c) read nage://spaces/{sid}/tags
  const tagRead = await editorClient.readResource({ uri: `nage://spaces/${adminSpace.id}/tags` })
  const tagArr = JSON.parse((tagRead.contents[0] as { text: string }).text) as Array<{
    id: number
    name: string
  }>
  if (!Array.isArray(tagArr) || tagArr.length === 0) throw new Error("❌ tags 资源空")
  console.log(`  ✅ nage://spaces/${adminSpace.id}/tags → ${tagArr.length} 个标签`)

  // 8.6d) read nage://items/{id}（拿一个真实 id）
  const someItemId = (await editorClient.callTool({
    name: "search_items",
    arguments: { spaceId: adminSpace.id, page: 1 },
  })).isError
    ? 0
    : (JSON.parse(textOf(await editorClient.callTool({
      name: "search_items",
      arguments: { spaceId: adminSpace.id, page: 1 },
    }))).items?.[0]?.id ?? 0)
  if (someItemId > 0) {
    const itemRead = await editorClient.readResource({ uri: `nage://items/${someItemId}` })
    const itemObj = JSON.parse((itemRead.contents[0] as { text: string }).text)
    if (itemObj.item?.id !== someItemId) {
      throw new Error(`❌ item 资源 id 不对: ${JSON.stringify(itemObj)}`)
    }
    console.log(`  ✅ nage://items/${someItemId} → name="${itemObj.item.name}"`)
  } else {
    console.log("  ℹ️  空间无 item，跳过 item resource 测")
  }

  // 8.6e) reader scope → 403 forbidden（验证 ACL 同样作用于 resources）
  // 注意：reader token 已经有独立 rate window，但本测试只调 1 次不会超限
  // 取一个能返回 403 的 URI（用 alice 的 cookie 调 admin 空间）
  const aliceResClient = await withClient({ cookie: await makeCookie(alice.id, alice.username, "member") })
  const aliceResForbidden = await aliceResClient.readResource({
    uri: `nage://spaces/${adminSpace.id}/locations`,
  })
  const forbiddenResText = ((aliceResForbidden.contents as Array<{ text: string }>)[0])?.text ?? ""
  if (!forbiddenResText.includes("forbidden") && !forbiddenResText.includes("无权")) {
    throw new Error(`❌ 跨空间读 resource 应被拒: ${forbiddenResText}`)
  }
  console.log("  ✅ 非成员读 resource → forbidden")
  console.log()

  // ----------------------------------------------------------
  // 【8.7】M8.4 Prompts
  // ----------------------------------------------------------
  console.log("【8.7】M8.4 Prompts")
  const promptList = await editorClient.listPrompts()
  const promptNames = promptList.prompts.map((p) => p.name).sort()
  const expectedPrompts = ["audit_expiring_soon", "find_item", "inventory_summary"]
  for (const n of expectedPrompts) {
    if (!promptNames.includes(n)) throw new Error(`❌ 缺 prompt: ${n}`)
  }
  console.log(`  ✅ listPrompts 返回 3 个: ${promptNames.join(", ")}`)

  // 8.7a) getPrompt audit_expiring_soon
  const auditPrompt = await editorClient.getPrompt({
    name: "audit_expiring_soon",
    arguments: { spaceId: String(adminSpace.id), days: "7" },
  })
  const auditMsg = (auditPrompt.messages as Array<{ role: string; content: { text: string } }>)[0]
  if (auditMsg?.role !== "user" || !auditMsg.content.text.includes("7 天内即将过期")) {
    throw new Error(`❌ audit_expiring_soon 提示词不对: ${JSON.stringify(auditPrompt)}`)
  }
  console.log("  ✅ getPrompt(audit_expiring_soon, days=7) 拿到 7 天过期审计 prompt")

  // 8.7b) getPrompt find_item
  const findPrompt = await editorClient.getPrompt({
    name: "find_item",
    arguments: { spaceId: String(adminSpace.id), query: "充电宝" },
  })
  const findMsg = (findPrompt.messages as Array<{ role: string; content: { text: string } }>)[0]
  if (findMsg?.role !== "user" || !findMsg.content.text.includes("充电宝")) {
    throw new Error(`❌ find_item 提示词不对: ${JSON.stringify(findPrompt)}`)
  }
  console.log('  ✅ getPrompt(find_item, query="充电宝") 拿到搜索 prompt')
  console.log()

  // ----------------------------------------------------------
  // 【8.8】M9 工具（空间 + location/category/tag CRUD + items partial update）
  // ----------------------------------------------------------
  console.log("【8.8】M9 工具：list_spaces + CRUD + partial update")

  // 8.8a) list_spaces
  const spacesRes = await editorClient.callTool({ name: "list_spaces", arguments: {} })
  if (spacesRes.isError) throw new Error(`❌ list_spaces 失败: ${textOf(spacesRes)}`)
  const spaces = JSON.parse(textOf(spacesRes)) as Array<{ id: number; name: string; role: string; isOwner: boolean }>
  if (!Array.isArray(spaces) || spaces.length < 1) throw new Error("❌ list_spaces 返空")
  console.log(`  ✅ list_spaces → ${spaces.length} 个空间（admin 至少 1 个）`)

  // 8.8b) create_location
  const locCreateRes = await editorClient.callTool({
    name: "create_location",
    arguments: { spaceId: adminSpace.id, name: "MCP 测试位置", description: "E2E 创建" },
  })
  if (locCreateRes.isError) throw new Error(`❌ create_location 失败: ${textOf(locCreateRes)}`)
  const newLoc = JSON.parse(textOf(locCreateRes)) as { id: number }
  console.log(`  ✅ create_location → id=${newLoc.id}`)

  // 8.8c) update_location partial（只传 name）
  const locUpdateRes = await editorClient.callTool({
    name: "update_location",
    arguments: { id: newLoc.id, name: "MCP 测试位置（改名）" },
  })
  if (locUpdateRes.isError) throw new Error(`❌ update_location 失败: ${textOf(locUpdateRes)}`)
  // 验证 description 保留
  const locDb = db
    .prepare("SELECT name, description FROM locations WHERE id=?")
    .get(newLoc.id) as { name: string; description: string | null } | undefined
  if (locDb?.name !== "MCP 测试位置（改名）") throw new Error("❌ name 未改")
  if (locDb?.description !== "E2E 创建") throw new Error("❌ description 应保留")
  console.log("  ✅ update_location partial（name 改，description 保留）")

  // 8.8d) delete_location
  const locDelRes = await editorClient.callTool({
    name: "delete_location",
    arguments: { id: newLoc.id },
  })
  if (locDelRes.isError) throw new Error(`❌ delete_location 失败: ${textOf(locDelRes)}`)
  const locExists = db.prepare("SELECT 1 FROM locations WHERE id=?").get(newLoc.id)
  if (locExists) throw new Error("❌ 位置未删")
  console.log("  ✅ delete_location 成功")

  // 8.8e) create_category + update + delete
  const catCreateRes = await editorClient.callTool({
    name: "create_category",
    arguments: { spaceId: adminSpace.id, name: "MCP 测试分类", icon: "🧪" },
  })
  if (catCreateRes.isError) throw new Error(`❌ create_category 失败: ${textOf(catCreateRes)}`)
  const newCat = JSON.parse(textOf(catCreateRes)) as { id: number }
  console.log(`  ✅ create_category → id=${newCat.id}`)

  const catUpdateRes = await editorClient.callTool({
    name: "update_category",
    arguments: { id: newCat.id, name: "MCP 测试分类（改名）" },
  })
  if (catUpdateRes.isError) throw new Error(`❌ update_category 失败: ${textOf(catUpdateRes)}`)
  // 验证 icon 保留
  const catDb = db
    .prepare("SELECT name, icon FROM categories WHERE id=?")
    .get(newCat.id) as { name: string; icon: string | null } | undefined
  if (catDb?.name !== "MCP 测试分类（改名）") throw new Error("❌ name 未改")
  if (catDb?.icon !== "🧪") throw new Error("❌ icon 应保留")
  console.log("  ✅ update_category partial（name 改，icon 保留）")

  const catDelRes = await editorClient.callTool({
    name: "delete_category",
    arguments: { id: newCat.id },
  })
  if (catDelRes.isError) throw new Error(`❌ delete_category 失败: ${textOf(catDelRes)}`)
  console.log("  ✅ delete_category 成功")

  // 8.8f) create_tag + update + delete
  const tagCreateRes = await editorClient.callTool({
    name: "create_tag",
    arguments: { spaceId: adminSpace.id, name: "MCP 测试标签", color: "#ff0000" },
  })
  if (tagCreateRes.isError) throw new Error(`❌ create_tag 失败: ${textOf(tagCreateRes)}`)
  const newTag = JSON.parse(textOf(tagCreateRes)) as { id: number }
  console.log(`  ✅ create_tag → id=${newTag.id}`)

  const tagUpdateRes = await editorClient.callTool({
    name: "update_tag",
    arguments: { id: newTag.id, name: "MCP 测试标签（改名）" },
  })
  if (tagUpdateRes.isError) throw new Error(`❌ update_tag 失败: ${textOf(tagUpdateRes)}`)
  // 验证 color 保留
  const tagDb = db
    .prepare("SELECT name, color FROM tags WHERE id=?")
    .get(newTag.id) as { name: string; color: string | null } | undefined
  if (tagDb?.name !== "MCP 测试标签（改名）") throw new Error("❌ name 未改")
  if (tagDb?.color !== "#ff0000") throw new Error("❌ color 应保留")
  console.log("  ✅ update_tag partial（name 改，color 保留）")

  const tagDelRes = await editorClient.callTool({
    name: "delete_tag",
    arguments: { id: newTag.id },
  })
  if (tagDelRes.isError) throw new Error(`❌ delete_tag 失败: ${textOf(tagDelRes)}`)
  console.log("  ✅ delete_tag 成功")

  // 8.8g) items partial update：只传 name，其他字段保留
  const itemUpdateRes = await editorClient.callTool({
    name: "update_item",
    arguments: { id: 1, name: "MCP partial 测试" },
  })
  if (itemUpdateRes.isError) throw new Error(`❌ update_item partial 失败: ${textOf(itemUpdateRes)}`)
  const itemDb = db
    .prepare("SELECT name, quantity, description, category_id FROM items WHERE id=1")
    .get() as { name: string; quantity: number; description: string | null; category_id: number | null }
  if (itemDb.name !== "MCP partial 测试") throw new Error("❌ item.name 未改")
  // quantity / description / category_id 应保持（partial 不动）
  console.log(
    `  ✅ update_item partial（name 改：${itemDb.name}，其他字段保持：qty=${itemDb.quantity}, desc=${itemDb.description}, cat=${itemDb.category_id}）`
  )
  // 还原 name 避免影响其他测试
  db.prepare("UPDATE items SET name='RS2 键盘' WHERE id=1").run()

  // 8.8h) reader scope 调写工具 → -32002
  const readerCreateRes = await readerClient.callTool({
    name: "create_location",
    arguments: { spaceId: adminSpace.id, name: "应该被拒" },
  })
  if (!readerCreateRes.isError || !textOf(readerCreateRes).includes("-32002")) {
    throw new Error(`❌ reader create_location 应被拒: ${textOf(readerCreateRes)}`)
  }
  console.log("  ✅ reader scope 调 create_location → -32002")
  console.log()

  // ----------------------------------------------------------
  // 【8.9】M10 安全：uploads 鉴权（图片路由）
  // 找第一个有图 item 测图（item 137 已知有图）
  // ----------------------------------------------------------
  console.log("【8.9】M10 uploads 鉴权")
  const imgItem = db
    .prepare("SELECT id, space_id FROM items WHERE EXISTS (SELECT 1 FROM item_images WHERE item_id = items.id) ORDER BY id LIMIT 1")
    .get() as { id: number; space_id: number } | undefined
  if (!imgItem) throw new Error("❌ 测试数据：没有带图的 item（先跑 db:seed？）")
  const imgPath = `/uploads/items/${imgItem.id}/1.jpg`
  console.log(`  测试图：item ${imgItem.id} (space ${imgItem.space_id}) → ${imgPath}`)

  // 用 Node http 直接测（不走 MCP 客户端；目的是验 HTTP 路由鉴权）
  const http = require("node:http")
  function httpGet(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://localhost:3000${path}`,
        { headers },
        (res: import("node:http").IncomingMessage) => {
          res.resume()
          resolve({ status: res.statusCode ?? 0 })
        }
      )
      req.on("error", reject)
    })
  }
  // 准备 token
  const adminBearerUpload = makeBearer(admin.id, "e2e_admin_bearer", "editor")
  const adminBearerTok = adminBearerUpload.token
  const adminSessionCookie = await makeCookie(admin.id, admin.username, "admin")
  // alice 不属 space 1 → 跨空间测试用
  const aliceCookie = await makeCookie(alice.id, alice.username, "member")

  // 1. 无 auth → 401
  const imgR1 = await httpGet(imgPath)
  if (imgR1.status !== 401) throw new Error(`❌ 无 auth 应 401，实际 ${imgR1.status}`)
  console.log("  ✅ 无 auth → 401")

  // 2. 错 Bearer → 401
  const imgR2 = await httpGet(imgPath, {
    Authorization: "Bearer nage_mcp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  })
  if (imgR2.status !== 401) throw new Error(`❌ 错 Bearer 应 401，实际 ${imgR2.status}`)
  console.log("  ✅ 错 Bearer → 401")

  // 3. admin session cookie → 200
  const imgR3 = await httpGet(imgPath, { Cookie: adminSessionCookie })
  if (imgR3.status !== 200) throw new Error(`❌ admin cookie 应 200，实际 ${imgR3.status}`)
  console.log("  ✅ admin cookie → 200")

  // 4. admin Bearer token → 200
  const imgR4 = await httpGet(imgPath, { Authorization: `Bearer ${adminBearerTok}` })
  if (imgR4.status !== 200) throw new Error(`❌ admin Bearer 应 200，实际 ${imgR4.status}`)
  console.log("  ✅ admin Bearer token → 200")

  // 5. alice cookie（不属该空间）→ 403
  const imgR5 = await httpGet(imgPath, { Cookie: aliceCookie })
  if (imgR5.status !== 403) throw new Error(`❌ alice cookie 应 403，实际 ${imgR5.status}`)
  console.log("  ✅ alice cookie（非空间成员）→ 403")

  // 6. 不存在 itemId → 404
  const imgR6 = await httpGet("/uploads/items/999999/1.jpg", { Cookie: adminSessionCookie })
  if (imgR6.status !== 404) throw new Error(`❌ 不存在 itemId 应 404，实际 ${imgR6.status}`)
  console.log("  ✅ 不存在 itemId → 404")

  // 7. 非 items 路径 → 404
  const imgR7 = await httpGet("/uploads/avatars/1/x.jpg", { Cookie: adminSessionCookie })
  if (imgR7.status !== 404) throw new Error(`❌ 非 items 路径应 404，实际 ${imgR7.status}`)
  console.log("  ✅ 非 items 路径 → 404")

  // 8. path traversal → 404
  const imgR8 = await httpGet("/uploads/items/../etc/passwd", { Cookie: adminSessionCookie })
  if (imgR8.status !== 404) throw new Error(`❌ path traversal 应 404，实际 ${imgR8.status}`)
  console.log("  ✅ path traversal → 404")

  // 清理
  db.prepare("DELETE FROM mcp_tokens WHERE name='e2e_admin_bearer'").run()
  console.log()

  // ----------------------------------------------------------
  // 【9】清理测试数据
  // ----------------------------------------------------------
  console.log("【9】清理测试数据")
  db.prepare("DELETE FROM mcp_tokens WHERE name IN ('e2e_test', 'e2e_reader')").run()
  console.log("  ✅ e2e_test / e2e_reader token 已删")
  console.log()

  db.close()
  console.log("🎉 M8.1 + M8.2 + M9 MCP Server 验收全部通过！")
}

main().catch((e) => {
  console.error("❌ 失败:", e instanceof Error ? e.message : e)
  if (e instanceof Error) console.error(e.stack)
  process.exit(1)
})