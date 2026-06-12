"use server"

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import {
  CreateSpaceSchema,
  RenameSpaceSchema,
  DeleteSpaceSchema,
} from "@/lib/validation/schemas"
import { DEFAULT_SPACE_NAME, type ActionState } from "./types"

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

  // 同名下唯一
  const [existing] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.ownerId, user.id), eq(spaces.name, name)))
    .limit(1)
  if (existing) {
    return { error: "已存在同名空间" }
  }

  await db.insert(spaces).values({ name, ownerId: user.id })
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

  await db
    .update(spaces)
    .set({ name })
    .where(and(eq(spaces.id, id), eq(spaces.ownerId, user.id)))
  revalidatePath("/")
  return { ok: true }
}

export async function deleteSpaceAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteSpaceSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  // 至少保留 1 个空间
  const userSpaces = await db
    .select()
    .from(spaces)
    .where(eq(spaces.ownerId, user.id))
  if (userSpaces.length <= 1) {
    return { error: "至少保留一个空间" }
  }

  await db
    .delete(spaces)
    .where(and(eq(spaces.id, id), eq(spaces.ownerId, user.id)))
  revalidatePath("/")
  return { ok: true }
}

/** 用户首次进入系统时自动建默认空间。幂等。 */
export async function ensureDefaultSpace(ownerId: number): Promise<number> {
  const [existing] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.ownerId, ownerId), eq(spaces.name, DEFAULT_SPACE_NAME)))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(spaces)
    .values({ name: DEFAULT_SPACE_NAME, ownerId })
    .returning({ id: spaces.id })
  return created.id
}
