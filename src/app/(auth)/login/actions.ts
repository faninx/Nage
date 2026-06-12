"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { findUserByUsername } from "@/lib/auth/bootstrap"
import { verifyPassword } from "@/lib/auth/password"
import {
  checkLocked,
  clearAttempts,
  recordFailure,
} from "@/lib/auth/login-attempts"
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session"

const LoginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
  callbackUrl: z.string().optional(),
})

export type LoginState = {
  error?: string
}

const GENERIC_ERROR = "用户名或密码错误"

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  })

  if (!parsed.success) {
    return { error: GENERIC_ERROR }
  }
  const { username, password, callbackUrl } = parsed.data

  // 1. 是否被锁
  const lock = await checkLocked(username)
  if (lock.locked) {
    return {
      error: `账号已锁定，请 ${lock.remainingMinutes} 分钟后再试`,
    }
  }

  // 2. 查用户
  const user = await findUserByUsername(username)
  if (!user || !user.isActive) {
    // 仍然计一次失败，防用户名枚举
    await recordFailure(username)
    // 模拟一次 bcrypt 比较耗时，防 timing 攻击
    await verifyPassword(password, "$2a$12$" + "x".repeat(53))
    return { error: GENERIC_ERROR }
  }

  // 3. 验密码
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    await recordFailure(username)
    return { error: GENERIC_ERROR }
  }

  // 4. 成功：清失败 + 写 cookie
  await clearAttempts(username)
  await setSessionCookie({
    sub: String(user.id),
    role: user.role,
    username: user.username,
  })

  // 5. 更新 lastLoginAt
  const { db } = await import("@/lib/db")
  const { users } = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))

  // 6. 跳转
  redirect(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/")
}

export async function logoutAction() {
  await clearSessionCookie()
  redirect("/login")
}
