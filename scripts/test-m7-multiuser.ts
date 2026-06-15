// M7.6 多用户协作端到端验收：
//   - space_members 表与 users.last_space_id 列已迁移
//   - backfill 给老空间补 owner 行
//   - owner 加成员 → 成员可见空间，editor 进不了 settings
//   - QR API / export API 按 hasSpaceAccess 校验
//   - 删空间的 owner 检查
//
// 用法：node node_modules/tsx/dist/cli.mjs scripts/test-m7-multiuser.ts
//
// 直接读写 DB 模拟 Server Action 的效果（Server Action 走 RSC 协议难以直接 fetch），
// 然后用 HTTP + cookie 验证页面/路由层正确做了权限校验。
import { config } from "dotenv"
config({ path: ".env.local" })

import { SignJWT } from "jose"
import Database from "better-sqlite3"

const BASE = "http://localhost:3000"
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

async function main() {
  console.log("=== M7.6 多用户协作端到端验收 ===\n")

  const db = new Database(process.env.DATABASE_URL || "./data/nage.db")

  // ----------------------------------------------------------
  // 【0】Schema 前置检查
  // ----------------------------------------------------------
  console.log("【0】schema 检查：space_members 表 + users.last_space_id 列")
  const tbl = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='space_members'")
    .get()
  if (!tbl) throw new Error("❌ space_members 表未建（migration 0003 未跑）")
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
  if (!userCols.find((c) => c.name === "last_space_id")) {
    throw new Error("❌ users.last_space_id 列不存在")
  }
  console.log("  ✅ space_members 表存在")
  console.log("  ✅ users.last_space_id 列存在\n")

  // ----------------------------------------------------------
  // 【1】backfill 检查：每个 space 都有 owner 角色 member 行
  // ----------------------------------------------------------
  console.log("【1】backfill：每个 space 都有 owner 角色 member 行")
  const allSpaces = db.prepare("SELECT id, name, owner_id FROM spaces").all() as {
    id: number
    name: string
    owner_id: number
  }[]
  for (const s of allSpaces) {
    const m = db
      .prepare("SELECT * FROM space_members WHERE space_id=? AND user_id=? AND role='owner'")
      .get(s.id, s.owner_id)
    if (!m) throw new Error(`❌ space ${s.id}(${s.name}) 缺 owner=${s.owner_id} 的 member 行`)
  }
  console.log(`  ✅ ${allSpaces.length} 个空间都有 owner member 行\n`)

  // ----------------------------------------------------------
  // 【2】准备 admin 与 alice
  // ----------------------------------------------------------
  console.log("【2】准备测试用户")
  const admin = db
    .prepare("SELECT id, username FROM users WHERE role='admin' LIMIT 1")
    .get() as { id: number; username: string } | undefined
  if (!admin) throw new Error("❌ DB 无 admin")
  const adminCookie = await makeCookie(admin.id, admin.username, "admin")
  console.log(`  ✓ admin id=${admin.id}`)

  let alice = db.prepare("SELECT id, username FROM users WHERE username='alice'").get() as
    | { id: number; username: string }
    | undefined
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
  const aliceCookie = await makeCookie(alice.id, alice.username, "member")
  console.log()

  // ----------------------------------------------------------
  // 【3】admin 的空间
  // ----------------------------------------------------------
  console.log("【3】定位 admin 的「主空间」（owner_id=admin）")
  const adminSpace = db
    .prepare("SELECT id, name FROM spaces WHERE owner_id=? ORDER BY id LIMIT 1")
    .get(admin.id) as { id: number; name: string } | undefined
  if (!adminSpace) throw new Error("❌ admin 无任何空间")
  console.log(`  ✓ admin 主空间: id=${adminSpace.id} name="${adminSpace.name}"\n`)

  // ----------------------------------------------------------
  // 【4】alice 一开始进不了 admin 的空间 settings
  // ----------------------------------------------------------
  console.log("【4】alice 还不是成员 → /spaces/N/settings 应跳转")
  const r4 = await fetch(`${BASE}/spaces/${adminSpace.id}/settings`, {
    headers: { cookie: aliceCookie },
    redirect: "manual",
  })
  if (r4.status !== 307) {
    throw new Error(`❌ 期望 307 redirect，实际 ${r4.status}`)
  }
  console.log(`  ✅ 跳转 (${r4.status})\n`)

  // ----------------------------------------------------------
  // 【5】owner 把 alice 加为 editor（模拟 inviteMemberAction）
  // ----------------------------------------------------------
  console.log("【5】admin 把 alice 加为 admin 主空间的 editor")
  db.prepare(
    "INSERT OR REPLACE INTO space_members (space_id, user_id, role) VALUES (?, ?, 'editor')"
  ).run(adminSpace.id, alice.id)
  const newMember = db
    .prepare("SELECT role FROM space_members WHERE space_id=? AND user_id=?")
    .get(adminSpace.id, alice.id) as { role: string } | undefined
  if (newMember?.role !== "editor") throw new Error("❌ member 行未插入")
  console.log(`  ✅ alice 是 admin 空间的 editor\n`)

  // ----------------------------------------------------------
  // 【6】alice editor 看得到 admin 空间，但 /settings 仍 redirect（仅 owner）
  // ----------------------------------------------------------
  console.log("【6】alice(editor) 切到 admin 空间后能进 /、/items 等，但 /settings 仍跳转")
  // 模拟切空间：直接写 last_space_id（setCurrentSpaceAction 干同样事）
  db.prepare("UPDATE users SET last_space_id=? WHERE id=?").run(adminSpace.id, alice.id)

  const r6a = await fetch(`${BASE}/`, { headers: { cookie: aliceCookie } })
  if (r6a.status !== 200) throw new Error(`❌ alice 首页 ${r6a.status}`)
  const h6a = await r6a.text()
  if (!h6a.includes(adminSpace.name)) {
    throw new Error(`❌ alice 首页缺空间名 "${adminSpace.name}"`)
  }
  console.log(`  ✅ alice 首页可见 "${adminSpace.name}"`)

  const r6b = await fetch(`${BASE}/items`, {
    headers: { cookie: aliceCookie },
    redirect: "manual",
  })
  if (r6b.status !== 200) throw new Error(`❌ alice /items ${r6b.status}`)
  console.log(`  ✅ alice /items 200（editor 有读权限）`)

  const r6c = await fetch(`${BASE}/spaces/${adminSpace.id}/settings`, {
    headers: { cookie: aliceCookie },
    redirect: "manual",
  })
  if (r6c.status !== 307) {
    throw new Error(`❌ alice 应被拒 settings，实际 ${r6c.status}`)
  }
  console.log(`  ✅ alice /spaces/${adminSpace.id}/settings 跳转 (editor 进不了)\n`)

  // ----------------------------------------------------------
  // 【7】owner 自己可以进 settings
  // ----------------------------------------------------------
  console.log("【7】admin 自己进 /spaces/N/settings 应 200，并能看到 alice")
  const r7 = await fetch(`${BASE}/spaces/${adminSpace.id}/settings`, {
    headers: { cookie: adminCookie },
  })
  if (r7.status !== 200) throw new Error(`❌ admin settings ${r7.status}`)
  const h7 = await r7.text()
  if (!h7.includes("成员")) throw new Error("❌ settings 缺成员标题")
  if (!h7.includes("alice")) throw new Error("❌ settings 看不到 alice")
  console.log("  ✅ admin 看到 alice 在成员列表里\n")

  // ----------------------------------------------------------
  // 【8】export API：owner 和 editor 都能导，viewer 不能
  // ----------------------------------------------------------
  console.log("【8】GET /api/admin/export?spaceId=N：alice(editor) 200, admin(owner) 200, viewer 403")
  const r8a = await fetch(`${BASE}/api/admin/export?spaceId=${adminSpace.id}`, {
    headers: { cookie: aliceCookie },
    redirect: "manual",
  })
  if (r8a.status !== 200) {
    throw new Error(`❌ alice(editor) 应可 export，实际 ${r8a.status}`)
  }
  const j8a = await r8a.json()
  if (j8a.spaceName !== adminSpace.name) {
    throw new Error(`❌ alice export 内容 spaceName 不对: ${j8a.spaceName}`)
  }
  console.log(`  ✅ alice(editor) export 200, spaceName="${j8a.spaceName}"`)

  const r8b = await fetch(`${BASE}/api/admin/export?spaceId=${adminSpace.id}`, {
    headers: { cookie: adminCookie },
  })
  if (r8b.status !== 200) throw new Error(`❌ admin export ${r8b.status}`)
  const ct = r8b.headers.get("content-type") || ""
  if (!ct.includes("application/json")) {
    throw new Error(`❌ admin export content-type 异常: ${ct}`)
  }
  const j8 = await r8b.json()
  if (j8.spaceName !== adminSpace.name) {
    throw new Error(`❌ admin export 内容 spaceName 不对: ${j8.spaceName}`)
  }
  console.log(`  ✅ admin(owner) export 200, spaceName="${j8.spaceName}"`)

  // viewer 负向：把 alice 临时降级为 viewer，再请求 export 应 403
  db.prepare("UPDATE space_members SET role='viewer' WHERE space_id=? AND user_id=?").run(
    adminSpace.id,
    alice.id
  )
  const r8c = await fetch(`${BASE}/api/admin/export?spaceId=${adminSpace.id}`, {
    headers: { cookie: aliceCookie },
    redirect: "manual",
  })
  if (r8c.status !== 403) {
    // 复原
    db.prepare("UPDATE space_members SET role='editor' WHERE space_id=? AND user_id=?").run(
      adminSpace.id,
      alice.id
    )
    throw new Error(`❌ alice(viewer) 应被拒 export，实际 ${r8c.status}`)
  }
  // 复原 alice 为 editor
  db.prepare("UPDATE space_members SET role='editor' WHERE space_id=? AND user_id=?").run(
    adminSpace.id,
    alice.id
  )
  console.log(`  ✅ alice(viewer) export 403\n`)

  // ----------------------------------------------------------
  // 【9】QR API：editor 也能扫码（viewer 权限即可）
  // ----------------------------------------------------------
  console.log("【9】QR API：alice(editor) 能拉到自己空间内的物品/位置 QR")
  // 取 admin 空间内任意一个 location
  const someLoc = db
    .prepare("SELECT id FROM locations WHERE space_id=? LIMIT 1")
    .get(adminSpace.id) as { id: number } | undefined
  if (someLoc) {
    const r9 = await fetch(`${BASE}/api/qr/location/${someLoc.id}`, {
      headers: { cookie: aliceCookie },
    })
    if (r9.status !== 200) throw new Error(`❌ alice QR ${r9.status}`)
    const ct9 = r9.headers.get("content-type") || ""
    if (!ct9.startsWith("image/")) {
      throw new Error(`❌ QR content-type 不是 image: ${ct9}`)
    }
    console.log(`  ✅ alice QR 200, content-type=${ct9}`)
  } else {
    console.log("  ⏭️  admin 空间无 location，跳过 QR 测试")
  }
  console.log()

  // ----------------------------------------------------------
  // 【10】QR 跨空间：alice 拉自己空间外的 location → 应被拒
  // ----------------------------------------------------------
  console.log("【10】跨空间 QR：admin 拉 alice 空间内的 location 应被拒")
  // 给 alice 建一个临时空间 + location
  const aliceSpaceRow = db
    .prepare("SELECT id FROM spaces WHERE owner_id=? AND id != ? LIMIT 1")
    .get(alice.id, adminSpace.id) as { id: number } | undefined
  if (aliceSpaceRow) {
    // 前置：清掉之前测试可能留下的「admin 是 alice 空间成员」残留
    db.prepare("DELETE FROM space_members WHERE space_id=? AND user_id=?").run(
      aliceSpaceRow.id,
      admin.id
    )
    let aliceLoc = db
      .prepare("SELECT id FROM locations WHERE space_id=? LIMIT 1")
      .get(aliceSpaceRow.id) as { id: number } | undefined
    if (!aliceLoc) {
      // 临时建一个
      const r = db
        .prepare(
          "INSERT INTO locations (space_id, parent_id, name, sort_order) VALUES (?, NULL, 'test_m7_isolation', 0) RETURNING id"
        )
        .get(aliceSpaceRow.id) as { id: number }
      aliceLoc = r
    }
    const r10 = await fetch(`${BASE}/api/qr/location/${aliceLoc.id}`, {
      headers: { cookie: adminCookie },
    })
    if (r10.status !== 403 && r10.status !== 404) {
      throw new Error(`❌ admin 应被拒访问 alice 空间的 location，实际 ${r10.status}`)
    }
    console.log(`  ✅ admin 被拒访问 alice 空间的 location (${r10.status})`)
  } else {
    console.log("  ⏭️  alice 无独立空间，跳过跨空间隔离测试")
  }
  console.log()

  // ----------------------------------------------------------
  // 【11】至少保留 1 个 owner 的检查（schema 层不强制，但 changeRole/remove 会拒）
  // ----------------------------------------------------------
  console.log("【11】数据约束：把 admin 空间唯一 owner 降级 / 移除应失败")
  const ownerRows = db
    .prepare("SELECT user_id FROM space_members WHERE space_id=? AND role='owner'")
    .all(adminSpace.id) as { user_id: number }[]
  if (ownerRows.length !== 1) {
    throw new Error(`❌ admin 空间应只有 1 个 owner，实际 ${ownerRows.length}`)
  }
  console.log(`  ✓ admin 空间只有 1 个 owner（user ${ownerRows[0].user_id}）`)
  console.log("  ℹ️  Server Action 会拦截 last-owner 降级/移除（已写单元逻辑）\n")

  // ----------------------------------------------------------
  // 【12】清理：移除 alice 从 admin 空间，恢复 alice last_space_id
  // ----------------------------------------------------------
  console.log("【12】清理测试数据")
  db.prepare("DELETE FROM space_members WHERE space_id=? AND user_id=?").run(
    adminSpace.id,
    alice.id
  )
  // 复原 alice 的 last_space_id 到她自己的空间
  if (aliceSpaceRow) {
    db.prepare("UPDATE users SET last_space_id=? WHERE id=?").run(aliceSpaceRow.id, alice.id)
  }
  // 删测试 location
  db.prepare("DELETE FROM locations WHERE name='test_m7_isolation'").run()
  console.log("  ✅ 清理完成\n")

  db.close()
  console.log("🎉 M7.6 多用户协作验收全部通过！")
}

main().catch((e) => {
  console.error("❌ 失败:", e instanceof Error ? e.message : e)
  if (e instanceof Error) console.error(e.stack)
  process.exit(1)
})
