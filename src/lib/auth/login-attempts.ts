import "server-only"
import { db } from "@/lib/db"
import { loginAttempts } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 10 * 60 * 1000 // 10 分钟

export type LockStatus =
  | { locked: false }
  | { locked: true; until: Date; remainingMinutes: number }

export async function checkLocked(username: string): Promise<LockStatus> {
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.username, username))
    .limit(1)

  if (!row?.lockedUntil) {
    return { locked: false }
  }

  const until = row.lockedUntil
  if (until.getTime() <= Date.now()) {
    return { locked: false }
  }

  return {
    locked: true,
    until,
    remainingMinutes: Math.ceil((until.getTime() - Date.now()) / 60000),
  }
}

export async function recordFailure(username: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  // 单条 SQL：插入或累加，> 5 写锁定时间
  await db
    .insert(loginAttempts)
    .values({
      username,
      count: 1,
      lastAttemptAt: new Date(),
    })
    .onConflictDoUpdate({
      target: loginAttempts.username,
      set: {
        count: sql`${loginAttempts.count} + 1`,
        lastAttemptAt: new Date(),
        // 只在原本没锁定时设置新的锁定时间
        lockedUntil: sql`CASE
          WHEN ${loginAttempts.lockedUntil} IS NULL OR ${loginAttempts.lockedUntil} <= ${now}
          THEN datetime(${now} + ${LOCK_DURATION_MS / 1000}, 'unixepoch')
          ELSE ${loginAttempts.lockedUntil}
        END`,
      },
    })
}

export async function clearAttempts(username: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.username, username))
}

export async function isMaxAttemptsReached(username: string): Promise<boolean> {
  const [row] = await db
    .select({ count: loginAttempts.count })
    .from(loginAttempts)
    .where(eq(loginAttempts.username, username))
    .limit(1)
  return (row?.count ?? 0) >= MAX_ATTEMPTS
}
