"use server"

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { spaces, spaceMembers, users } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import {
  CreateSpaceSchema,
  RenameSpaceSchema,
  DeleteSpaceSchema,
} from "@/lib/validation/schemas"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { revalidateMySpaces } from "./_cache"
import { type ActionState } from "./types"

export async function createSpaceAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = CreateSpaceSchema.safeParse({ name: formData.get("name") })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { name } = parsed.data

  // 同名下唯一（限定在用户有权限的空间里）
  const accessible = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
    .where(and(eq(spaceMembers.userId, user.id), eq(spaces.name, name)))
    .limit(1)
  if (accessible.length > 0) {
    return { error: "已存在同名空间" }
  }

  const [created] = await db
    .insert(spaces)
    .values({ name, ownerId: user.id })
    .returning({ id: spaces.id })
  await db.insert(spaceMembers).values({
    spaceId: created.id,
    userId: user.id,
    role: "owner",
  })
  // 自动切到新空间
  await db.update(users).set({ lastSpaceId: created.id }).where(eq(users.id, user.id))
  revalidateMySpaces()
  revalidatePath("/")
  return { ok: true }
}

export async function renameSpaceAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = RenameSpaceSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name } = parsed.data

  if (!(await hasSpaceAccess(user.id, id, "owner"))) {
    return { error: "无权操作" }
  }
  // 检查同名（在该 user 自己的空间内，不含本 space 自身）
  const [conflict] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
    .where(
      and(
        eq(spaceMembers.userId, user.id),
        eq(spaces.name, name)
      )
    )
    .limit(1)
  if (conflict && conflict.id !== id) {
    return { error: "已存在同名空间" }
  }

  await db.update(spaces).set({ name }).where(eq(spaces.id, id))
  revalidateMySpaces()
  revalidatePath("/")
  return { ok: true }
}

export async function deleteSpaceAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteSpaceSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  if (!(await hasSpaceAccess(user.id, id, "owner"))) {
    return { error: "无权操作" }
  }

  // 至少保留 1 个空间（按"作为 owner 的空间"算）
  const ownedRows = await db
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.userId, user.id), eq(spaceMembers.role, "owner")))
  if (ownedRows.length <= 1) {
    return { error: "至少保留一个空间" }
  }

  // FK onDelete cascade 处理 locations/categories/tags/items/...
  await db.delete(spaces).where(eq(spaces.id, id))
  // 如果当前正在被删的就是 lastSpaceId，清掉
  await db
    .update(users)
    .set({ lastSpaceId: null })
    .where(and(eq(users.id, user.id), eq(users.lastSpaceId, id)))
  revalidateMySpaces()
  revalidatePath("/")
  return { ok: true }
}
