"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { hashPassword } from "@/lib/auth/password"
import {
  CreateMemberSchema,
  ResetPasswordSchema,
} from "@/lib/validation/schemas"
import type { ActionState } from "./types"

export async function createMemberAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin()
  const parsed = CreateMemberSchema.safeParse({
    username: formData.get("username"),
    nickname: formData.get("nickname"),
    password: formData.get("password"),
    role: formData.get("role"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { username, nickname, password, role } = parsed.data

  // 用户名唯一
  const [exists] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (exists) return { error: "用户名已存在" }

  const passwordHash = await hashPassword(password)
  await db.insert(users).values({
    username,
    nickname,
    passwordHash,
    role,
    isActive: true,
  })
  revalidatePath("/admin/members")
  return { ok: true }
}

export async function toggleMemberActiveAction(
  formData: FormData
): Promise<ActionState> {
  const me = await requireAdmin()
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id) || id <= 0) return { error: "参数错误" }

  // 不允许停用自己
  if (id === me.id) return { error: "不能停用自己" }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) return { error: "用户不存在" }

  await db
    .update(users)
    .set({ isActive: !target.isActive })
    .where(eq(users.id, id))
  revalidatePath("/admin/members")
  return { ok: true }
}

export async function resetPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin()
  const parsed = ResetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { userId, newPassword } = parsed.data

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!target) return { error: "用户不存在" }

  const passwordHash = await hashPassword(newPassword)
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
  revalidatePath("/admin/members")
  return { ok: true }
}
