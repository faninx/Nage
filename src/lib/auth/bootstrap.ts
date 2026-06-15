import "server-only"
import { db } from "@/lib/db"
import { users, spaces, spaceMembers } from "@/lib/db/schema"
import { hashPassword } from "./password"
import { generateSecret } from "./jwt"
import { sql, eq, and } from "drizzle-orm"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { randomBytes } from "node:crypto"
import { writeFileSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ENV_LOCAL_PATH = resolve(process.cwd(), ".env.local")

type BootstrapResult = {
  created: boolean
  username?: string
  password?: string
  jwtSecretGenerated: boolean
  message?: string
}

/**
 * 首次启动时建管理员 + 检查 JWT_SECRET。
 * 幂等：可重复调用，已有管理员时直接返回。
 */
export async function ensureBootstrap(): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    created: false,
    jwtSecretGenerated: false,
  }

  // 1. 检查/补 JWT_SECRET
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const secret = generateSecret()
    process.env.JWT_SECRET = secret
    writeEnvLocal({ JWT_SECRET: secret })
    result.jwtSecretGenerated = true
  }

  // 2. 跑迁移（首次启动空 DB 时建表；已有 DB 时幂等跳过）
  //    生产用 migrate() 跑 drizzle/*.sql；本地 dev 已 push 过也无副作用
  //    兼容 db:push 建表的情况：__drizzle_migrations 没记录但表已存在 → 忽略"already exists"
  //    兼容运维手跑过部分 SQL 的情况：列已删 → 忽略"no such column/table/index"
  try {
    migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") })
  } catch (e) {
    // DrizzleError 顶层 message 不含具体 SQL 错误；真正的错误在 cause.message
    const cause = e instanceof Error && "cause" in e ? e.cause : null
    const allMsgs = [
      e instanceof Error ? e.message : String(e),
      cause instanceof Error ? cause.message : "",
    ].join("\n")
    if (
      /already exists/i.test(allMsgs) ||
      /no such (column|table|index)/i.test(allMsgs)
    ) {
      // 库已就绪（db:push 建的或运维手跑过部分 SQL），继续 bootstrap
    } else {
      throw e
    }
  }

  // 3. M7.1 backfill：为老空间补 member(owner) 行 + 补 users.lastSpaceId
  //    表结构升级时已经迁完；这里只补数据
  try {
    await backfillSpaceMembers()
  } catch (e) {
    console.warn(
      "[bootstrap] space_members backfill 失败（非致命，继续启动）:",
      e instanceof Error ? e.message : String(e)
    )
  }

  // 4. 检查/建管理员
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)

  if (count > 0) {
    return result
  }

  const envUsername = process.env.ADMIN_USERNAME?.trim()
  const envPassword = process.env.ADMIN_PASSWORD
  const passwordValid = !!envPassword && envPassword.length >= 6
  // 用 const 收窄：要么取 env，要么随机生成；不可能是 undefined
  const password = passwordValid
    ? envPassword
    : (() => {
        const generated = randomBytes(12).toString("base64url")
        result.password = generated
        writeEnvLocal({ ADMIN_PASSWORD: generated })
        process.env.ADMIN_PASSWORD = generated
        return generated
      })()
  const username = envUsername ?? (() => {
    const fallback = "admin"
    writeEnvLocal({ ADMIN_USERNAME: fallback })
    process.env.ADMIN_USERNAME = fallback
    return fallback
  })()

  result.created = true
  result.username = username
  if (!result.password) result.password = password

  const passwordHash = await hashPassword(password)
  await db.insert(users).values({
    username,
    passwordHash,
    nickname: "管理员",
    role: "admin",
    isActive: true,
  })

  return result
}

/**
 * 把已存在的 spaces 全部补一行 space_members(spaceId, ownerId, role='owner')，
 * 如果该行已经存在（按 PK）则忽略；同时为每个 user 把 lastSpaceId 指向他最早拥有的空间。
 *
 * 幂等：重复调用无副作用。
 */
async function backfillSpaceMembers() {
  // 1) 所有 spaces
  const allSpaces = await db.select({ id: spaces.id, ownerId: spaces.ownerId }).from(spaces)
  for (const s of allSpaces) {
    // 不存在则插入（onConflictDoNothing 防止与并发启动竞态）
    await db
      .insert(spaceMembers)
      .values({ spaceId: s.id, userId: s.ownerId, role: "owner" })
      .onConflictDoNothing()
  }

  // 2) 每个 user：lastSpaceId 为空 → 指向他最早拥有的空间
  const allUsers = await db
    .select({ id: users.id, lastSpaceId: users.lastSpaceId })
    .from(users)
  for (const u of allUsers) {
    if (u.lastSpaceId != null) continue
    const [first] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
      .where(and(eq(spaceMembers.userId, u.id), eq(spaces.ownerId, u.id)))
      .orderBy(spaces.id)
      .limit(1)
    if (first) {
      await db.update(users).set({ lastSpaceId: first.id }).where(eq(users.id, u.id))
    }
  }
}

function writeEnvLocal(patch: Record<string, string>) {
  let content = ""
  if (existsSync(ENV_LOCAL_PATH)) {
    content = readFileSync(ENV_LOCAL_PATH, "utf8")
  }

  for (const [key, value] of Object.entries(patch)) {
    const re = new RegExp(`^${key}=.*$`, "m")
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`)
    } else {
      content += `\n${key}=${value}\n`
    }
  }
  writeFileSync(ENV_LOCAL_PATH, content, "utf8")
}

export async function findUserByUsername(username: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  return u
}
