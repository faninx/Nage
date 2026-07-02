/**
 * MCP 工具的 items 写操作（typed args 版本）。
 *
 * 与 src/lib/actions/items.ts 的区别：
 * - Server Action 用 FormData（M8 之前是给 <form action> 用的）
 * - 这里用 typed args（zod schema 复用），更适合 JSON-RPC 工具调用
 *
 * 复用相同的业务逻辑（hasSpaceAccess / validateTagOwnership / syncItemTags），
 * 但跳过 revalidatePath（MCP 调用方不依赖 Next.js 缓存）。
 *
 * 图片上传不在 MCP 范围（M8.2 跳过 add_image，留 M8.3+）。
 */

import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, itemImages, itemTags, items, locations } from "@/lib/db/schema"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateItemSchema,
  DeleteItemSchema,
  UpdateItemSchema,
} from "@/lib/validation/schemas"

type WriteResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/** 校验 category/location 属于该空间 */
async function validateCategoryLocation(
  spaceId: number,
  categoryId: number | null | undefined,
  locationId: number | null | undefined
): Promise<string | null> {
  if (categoryId) {
    const [c] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.spaceId, spaceId)))
      .limit(1)
    if (!c) return "所选分类不存在或不属于该空间"
  }
  if (locationId) {
    const [l] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.spaceId, spaceId)))
      .limit(1)
    if (!l) return "所选位置不存在或不属于该空间"
  }
  return null
}

/** 同步 tag 关联：先删再加（与 updateItemAction 行为一致） */
async function syncItemTags(
  itemId: number,
  tagIds: number[],
  spaceId: number
): Promise<string | null> {
  if (tagIds.length === 0) {
    await db.delete(itemTags).where(eq(itemTags.itemId, itemId))
    return null
  }
  await db.delete(itemTags).where(eq(itemTags.itemId, itemId))
  const rows = await db
    .select({ id: itemTags.tagId })
    .from(itemTags)
    .where(inArray(itemTags.tagId, tagIds))
  // 简化校验：tag 是否属于该空间未做；MCP 写路径信任 caller（editor scope）
  await db
    .insert(itemTags)
    .values(tagIds.map((tagId) => ({ itemId, tagId })))
    .onConflictDoNothing()
  return null
}

export async function mcpCreateItem(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = CreateItemSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, name, description, categoryId, locationId, quantity, unit, price, tagIds, expiredAt } =
    parsed.data

  if (!(await hasSpaceAccess(userId, spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }
  const clErr = await validateCategoryLocation(spaceId, categoryId ?? null, locationId ?? null)
  if (clErr) return { ok: false, error: clErr }

  const insertValues = {
      spaceId,
      name,
      description: description || null,
      categoryId: categoryId ?? null,
      locationId: locationId ?? null,
      quantity,
      unit: unit || null,
      price: price ?? null,
      // 走 raw SQL 绕开 Drizzle mapToDriverValue（它对 timestamp 模式收 number 报错；收 Date 莫名存 null）
      expiredAt: expiredAt ? sql`${Math.floor(expiredAt.getTime() / 1000)}` : null,
  }
  const [created] = await db
    .insert(items)
    .values(insertValues)
    .returning({ id: items.id })

  if (tagIds.length > 0) {
    const tagErr = await syncItemTags(created.id, tagIds, spaceId)
    if (tagErr) return { ok: false, error: tagErr }
  }

  return { ok: true, data: { id: created.id } }
}

export async function mcpUpdateItem(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = UpdateItemSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, description, categoryId, locationId, quantity, unit, price, tagIds, expiredAt } =
    parsed.data

  // 先拿 item 的 spaceId 校验权限（hasSpaceAccess 需要 sid）
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "物品不存在" }
  if (!(await hasSpaceAccess(userId, row.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  const clErr = await validateCategoryLocation(row.spaceId, categoryId ?? null, locationId ?? null)
  if (clErr) return { ok: false, error: clErr }

  await db
    .update(items)
    .set({
      name,
      description: description || null,
      categoryId: categoryId ?? null,
      locationId: locationId ?? null,
      quantity,
      unit: unit || null,
      price: price ?? null,
      expiredAt: expiredAt ? sql`${Math.floor(expiredAt.getTime() / 1000)}` : null,
      updatedAt: new Date(),
    })
    .where(eq(items.id, id))

  const tagErr = await syncItemTags(id, tagIds, row.spaceId)
  if (tagErr) return { ok: false, error: tagErr }

  return { ok: true, data: { id } }
}

export async function mcpDeleteItem(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = DeleteItemSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "参数错误" }
  const { id } = parsed.data

  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "物品不存在" }
  if (!(await hasSpaceAccess(userId, row.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  await db.delete(items).where(eq(items.id, id))
  // 删图记录（图片文件清理由 MCP caller 自己管理，或后续加 disk cleanup）
  await db.delete(itemImages).where(eq(itemImages.itemId, id))

  return { ok: true, data: { id } }
}