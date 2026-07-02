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
  const adminSpace = db
    .prepare("SELECT id, name FROM spaces WHERE owner_id=? ORDER BY id LIMIT 1")
    .get(admin.id) as { id: number; name: string } | undefined
  if (!adminSpace) throw new Error("❌ admin 无空间")
  console.log(`  ✓ admin id=${admin.id}, space=${adminSpace.id}`)

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
  const fakeAuth = { userId: 999, source: "bearer", tokenId: 999 } as const

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
  const fakeAuth2 = { userId: 999, source: "bearer", tokenId: 1000 } as const
  const r2 = checkRateLimit(fakeAuth2)
  if (!r2.allowed) throw new Error("❌ 不同 tokenId 应有独立窗口")
  console.log("  ✅ 不同 token 独立窗口（不被其他 token 拖累）")

  // cookie 路径也独立
  const fakeAuth3 = { userId: 999, source: "cookie" as const } as const
  const r3 = checkRateLimit(fakeAuth3)
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
  // 【9】清理测试数据
  // ----------------------------------------------------------
  console.log("【9】清理测试数据")
  db.prepare("DELETE FROM mcp_tokens WHERE name IN ('e2e_test', 'e2e_reader')").run()
  console.log("  ✅ e2e_test / e2e_reader token 已删")
  console.log()

  db.close()
  console.log("🎉 M8.1 + M8.2 MCP Server 验收全部通过！")
}

main().catch((e) => {
  console.error("❌ 失败:", e instanceof Error ? e.message : e)
  if (e instanceof Error) console.error(e.stack)
  process.exit(1)
})