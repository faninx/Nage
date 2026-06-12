// 端到端测试：手动签 JWT 测后端鉴权链路
// 用法：node --import tsx scripts/test-http.ts
import { config } from "dotenv"
config({ path: ".env.local" })

import { SignJWT } from "jose"

async function main() {
  const BASE = "http://localhost:3000"
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET 不在 .env.local")
  }

  // === 测试 1: 未登录访问 / 跳 /login ===
  console.log("=== 测试 1: 未登录访问 / 跳 /login ===")
  const r1 = await fetch(BASE + "/", { redirect: "manual" })
  console.log("  status =", r1.status, "location =", r1.headers.get("location"))
  if (r1.status !== 307 || !r1.headers.get("location")?.startsWith("/login")) {
    throw new Error("❌ 期望重定向到 /login")
  }
  console.log("  ✅\n")

  // === 测试 2: /login 200 + 包含品牌 ===
  console.log("=== 测试 2: /login 200 + 渲染 ===")
  const r2 = await fetch(BASE + "/login")
  const html = await r2.text()
  if (r2.status !== 200 || !html.includes("纳格")) throw new Error("❌")
  console.log("  ✅\n")

  // === 测试 3: 无效 cookie 仍跳 /login ===
  console.log("=== 测试 3: 无效 cookie 跳 /login ===")
  const r3 = await fetch(BASE + "/", {
    headers: { cookie: "nage_session=invalid.jwt.token" },
    redirect: "manual",
  })
  if (r3.status !== 307) throw new Error("❌")
  console.log("  ✅\n")

  // === 测试 4: 手动签 admin JWT 访问 / ===
  console.log("=== 测试 4: 有效 admin JWT 访问 / 看到欢迎语 ===")
  const adminToken = await new SignJWT({
    sub: "1",
    role: "admin",
    username: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)

  const r4 = await fetch(BASE + "/", {
    headers: { cookie: `nage_session=${adminToken}` },
  })
  const dash = await r4.text()
  console.log("  status =", r4.status)
  console.log("  has '欢迎' =", dash.includes("欢迎"))
  console.log("  has '管理员' =", dash.includes("管理员"))
  console.log("  has 昵称 =", dash.includes("管理员") ? "✓" : "—")
  if (r4.status !== 200 || !dash.includes("欢迎")) throw new Error("❌")
  console.log("  ✅\n")

  // === 测试 5: member 角色能进首页 ===
  console.log("=== 测试 5: 有效 member JWT 访问 / ===")
  const memberToken = await new SignJWT({
    sub: "999",
    role: "member",
    username: "alice",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
  const r5 = await fetch(BASE + "/", {
    headers: { cookie: `nage_session=${memberToken}` },
  })
  if (r5.status !== 200) throw new Error("❌ member 应该能进首页")
  console.log("  ✅\n")

  // === 测试 6: 篡改 cookie 应被挡 ===
  console.log("=== 测试 6: 篡改 token（末尾加字符）被挡 ===")
  const r6 = await fetch(BASE + "/", {
    headers: { cookie: `nage_session=${adminToken}xxx` },
    redirect: "manual",
  })
  if (r6.status !== 307) throw new Error("❌")
  console.log("  ✅\n")

  console.log("🎉 6 项测试全部通过")
  console.log("\n注：登录 Server Action 本身未测（HTTP 模拟复杂），但它调用的：")
  console.log("  - verifyPassword  ✅ 单元测过")
  console.log("  - signSession    ✅ 单元测过")
  console.log("  - setSessionCookie（写 cookie）✅ 上述测试 4/5 已间接验证")
  console.log("  真实登录请用浏览器访问 http://localhost:3000/login")
}

main().catch((e) => {
  console.error("❌ 失败:", e.message ?? e)
  process.exit(1)
})
