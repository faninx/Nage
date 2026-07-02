/**
 * MCP 分类 write（create / update / delete）。
 */

import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateCategorySchema,
  DeleteCategorySchema,
  UpdateCategorySchema,
} from "@/lib/validation/schemas"

type WriteResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export async function mcpCreateCategory(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = CreateCategorySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, name, icon } = parsed.data

  if (!(await hasSpaceAccess(userId, spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }
  const [sib] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.spaceId, spaceId), eq(categories.name, name)))
    .limit(1)
  if (sib) return { ok: false, error: "该空间已存在同名分类" }

  const [created] = await db
    .insert(categories)
    .values({ spaceId, name, icon: icon || null })
    .returning({ id: categories.id })
  return { ok: true, data: { id: created.id } }
}

export async function mcpUpdateCategory(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = UpdateCategorySchema.partial().safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { id, name, icon } = parsed.data

  if (!id) return { ok: false, error: "id 必填" }
  const [cat] = await db
    .select({ spaceId: categories.spaceId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1)
  if (!cat) return { ok: false, error: "分类不存在" }
  if (!(await hasSpaceAccess(userId, cat.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  const patch: Record<string, unknown> = {}
  if (name !== undefined) {
    const [sib] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.spaceId, cat.spaceId), eq(categories.name, name)))
      .limit(1)
    if (sib && sib.id !== id) return { ok: false, error: "该空间已存在同名分类" }
    patch.name = name
  }
  if (icon !== undefined) patch.icon = icon || null
  if (Object.keys(patch).length === 0) return { ok: true, data: { id } }
  await db.update(categories).set(patch).where(eq(categories.id, id))
  return { ok: true, data: { id } }
}

export async function mcpDeleteCategory(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = DeleteCategorySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "参数错误" }
  const { id } = parsed.data

  const [cat] = await db
    .select({ spaceId: categories.spaceId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1)
  if (!cat) return { ok: false, error: "分类不存在" }
  if (!(await hasSpaceAccess(userId, cat.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }
  await db.delete(categories).where(eq(categories.id, id))
  return { ok: true, data: { id } }
}
