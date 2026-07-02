/**
 * MCP 标签 write（create / update / delete）。
 */

import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { itemTags, tags } from "@/lib/db/schema"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateTagSchema,
  DeleteTagSchema,
  UpdateTagSchema,
} from "@/lib/validation/schemas"

type WriteResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export async function mcpCreateTag(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = CreateTagSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, name, color } = parsed.data

  if (!(await hasSpaceAccess(userId, spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }
  const [sib] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.spaceId, spaceId), eq(tags.name, name)))
    .limit(1)
  if (sib) return { ok: false, error: "该空间已存在同名标签" }

  const [created] = await db
    .insert(tags)
    .values({ spaceId, name, color: color || null })
    .returning({ id: tags.id })
  return { ok: true, data: { id: created.id } }
}

export async function mcpUpdateTag(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = UpdateTagSchema.partial().safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { id, name, color } = parsed.data

  if (!id) return { ok: false, error: "id 必填" }
  const [tag] = await db
    .select({ spaceId: tags.spaceId })
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1)
  if (!tag) return { ok: false, error: "标签不存在" }
  if (!(await hasSpaceAccess(userId, tag.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  const patch: Record<string, unknown> = {}
  if (name !== undefined) {
    const [sib] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.spaceId, tag.spaceId), eq(tags.name, name)))
      .limit(1)
    if (sib && sib.id !== id) return { ok: false, error: "该空间已存在同名标签" }
    patch.name = name
  }
  if (color !== undefined) patch.color = color || null
  if (Object.keys(patch).length === 0) return { ok: true, data: { id } }
  await db.update(tags).set(patch).where(eq(tags.id, id))
  return { ok: true, data: { id } }
}

export async function mcpDeleteTag(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = DeleteTagSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "参数错误" }
  const { id } = parsed.data

  const [tag] = await db
    .select({ spaceId: tags.spaceId })
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1)
  if (!tag) return { ok: false, error: "标签不存在" }
  if (!(await hasSpaceAccess(userId, tag.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }
  // items_tag 多对多表 ON DELETE CASCADE
  await db.delete(itemTags).where(eq(itemTags.tagId, id))
  await db.delete(tags).where(eq(tags.id, id))
  return { ok: true, data: { id } }
}
