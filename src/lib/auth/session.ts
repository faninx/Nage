import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./jwt"

export type CurrentUser = {
  id: number
  username: string
  nickname: string
  role: "admin" | "member"
  avatar: string | null
}

/**
 * 读取 cookie 并校验 JWT，返回当前用户。
 * 用于 Server Components / Server Actions。
 * 若未登录或用户不存在，返回 null（不重定向）。
 */
export async function getSession(): Promise<{
  payload: SessionPayload
  user: CurrentUser
} | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const payload = await verifySession(token)
  if (!payload) return null

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, Number(payload.sub)))
    .limit(1)
  if (!user || !user.isActive) return null

  return {
    payload,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      avatar: user.avatar,
    },
  }
}

/** 未登录跳 /login；登录后返回用户。 */
export async function requireSession(callbackUrl?: string): Promise<CurrentUser> {
  const s = await getSession()
  if (!s) {
    const url = callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/login"
    redirect(url)
  }
  return s.user
}

/** 仅管理员；非管理员跳首页。 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireSession()
  if (user.role !== "admin") {
    redirect("/")
  }
  return user
}

/** 写入 session cookie。 */
export async function setSessionCookie(payload: Omit<SessionPayload, "iat" | "exp">) {
  const token = await signSession(payload)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

/** 清除 session cookie。 */
export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
