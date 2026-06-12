"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import {
  ChangeMyPasswordSchema,
  UpdateMyNicknameSchema,
} from "@/lib/validation/schemas"
import type { ActionState } from "./types"

/** 用户自己修改昵称（不需要 admin） */
export async function updateMyNicknameAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireSession()
  const parsed = UpdateMyNicknameSchema.safeParse({
    nickname: formData.get("nickname"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const nickname = parsed.data.nickname.trim()
  if (!nickname) return { error: "昵称不能为空" }
  if (nickname === me.nickname) return { ok: true }

  await db
    .update(users)
    .set({ nickname })
    .where(eq(users.id, me.id))

  // 顶栏 / 仪表盘 / 成员管理 / 物品相关地方都要刷新
  revalidatePath("/", "layout")
  return { ok: true }
}

/** 用户自己修改密码（不需要 admin） */
export async function changeMyPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireSession()
  const parsed = ChangeMyPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  // 重新取一次 password hash（me 里没存 hash）
  const row = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, me.id))
    .get()
  if (!row) return { error: "用户不存在" }
  const ok = await verifyPassword(parsed.data.currentPassword, row.passwordHash)
  if (!ok) return { error: "当前密码不正确" }

  const newHash = await hashPassword(parsed.data.newPassword)
  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, me.id))

  return { ok: true }
}
