"use server"

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { tags } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateTagSchema,
  UpdateTagSchema,
  DeleteTagSchema,
} from "@/lib/validation/schemas"
import type { ActionState } from "./types"

export async function createTagAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState & { data?: { id: number; name: string; color: string | null } }> {
  const user = await requireSession()
  const parsed = CreateTagSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, name, color } = parsed.data

  if (!(await hasSpaceAccess(user.id, spaceId, "editor"))) {
    return { error: "无权操作该空间" }
  }

  const [sib] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.spaceId, spaceId), eq(tags.name, name)))
    .limit(1)
  if (sib) {
    return {
      error: "该空间下已存在同名标签",
      data: { id: sib.id, name: sib.name, color: sib.color },
    }
  }

  const [inserted] = await db
    .insert(tags)
    .values({
      spaceId,
      name,
      color: color || null,
    })
    .returning({ id: tags.id })
  revalidatePath("/tags")
  return { ok: true, data: { id: inserted.id, name, color: color || null } }
}

export async function updateTagAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = UpdateTagSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, color } = parsed.data

  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1)
  if (!tag) return { error: "标签不存在" }
  if (!(await hasSpaceAccess(user.id, tag.spaceId, "editor"))) {
    return { error: "无权操作" }
  }

  const [sib] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.spaceId, tag.spaceId), eq(tags.name, name)))
    .limit(1)
  if (sib && sib.id !== id) return { error: "该空间下已存在同名标签" }

  await db
    .update(tags)
    .set({ name, color: color || null })
    .where(eq(tags.id, id))
  revalidatePath("/tags")
  return { ok: true }
}

export async function deleteTagAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteTagSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1)
  if (!tag) return { error: "标签不存在" }
  if (!(await hasSpaceAccess(user.id, tag.spaceId, "editor"))) {
    return { error: "无权操作" }
  }

  // itemTags 由 schema 的 cascade 处理
  await db.delete(tags).where(eq(tags.id, id))
  revalidatePath("/tags")
  return { ok: true }
}
