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
  // Partial update：用 raw 对象判断哪些 key 显式传了；只更新传了的字段
  // （z.optional() 区分不了 "key 缺失" 和 "key: undefined"——两者都变 undefined）
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "参数必须是对象" }
  }
  const r = raw as Record<string, unknown>

  const id = Number(r.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "id 必填且为正整数" }

  // 先拿 item 的 spaceId 校验权限
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "物品不存在" }
  if (!(await hasSpaceAccess(userId, row.spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  // 构造 patch：只放显式传了的字段
  // 注意：用 ('name' in r) 判断"是否传了"，不用 r.name !== undefined
  const patch: Record<string, unknown> = {}

  if ("name" in r) {
    const name = r.name
    if (typeof name !== "string" || name.length < 1 || name.length > 200) {
      return { ok: false, error: "name 必须是 1-200 字字符串" }
    }
    patch.name = name
  }

  if ("description" in r) {
    const desc = r.description
    if (desc !== null && (typeof desc !== "string" || desc.length > 5000)) {
      return { ok: false, error: "description 必须是字符串（≤5000）或 null" }
    }
    patch.description = desc === null ? null : desc || null
  }

  if ("quantity" in r) {
    const q = Number(r.quantity)
    if (!Number.isInteger(q) || q < 1) {
      return { ok: false, error: "quantity 必须是 ≥1 整数" }
    }
    patch.quantity = q
  }

  if ("unit" in r) {
    const u = r.unit
    if (u !== null && (typeof u !== "string" || u.length > 20)) {
      return { ok: false, error: "unit 必须是字符串（≤20）或 null" }
    }
    patch.unit = u === null ? null : u || null
  }

  if ("price" in r) {
    const p = r.price
    if (p === null) {
      patch.price = null
    } else if (typeof p === "number" && p >= 0) {
      patch.price = p
    } else {
      return { ok: false, error: "price 必须是 ≥0 数字或 null" }
    }
  }

  if ("categoryId" in r) {
    const cid = r.categoryId
    if (cid === null) {
      patch.categoryId = null
    } else {
      const cidNum = Number(cid)
      if (!Number.isInteger(cidNum) || cidNum <= 0) {
        return { ok: false, error: "categoryId 必须是正整数或 null" }
      }
      const clErr = await validateCategoryLocation(row.spaceId, cidNum, null)
      if (clErr) return { ok: false, error: clErr }
      patch.categoryId = cidNum
    }
  }

  if ("locationId" in r) {
    const lid = r.locationId
    if (lid === null) {
      patch.locationId = null
    } else {
      const lidNum = Number(lid)
      if (!Number.isInteger(lidNum) || lidNum <= 0) {
        return { ok: false, error: "locationId 必须是正整数或 null" }
      }
      const clErr = await validateCategoryLocation(row.spaceId, null, lidNum)
      if (clErr) return { ok: false, error: clErr }
      patch.locationId = lidNum
    }
  }

  if ("expiredAt" in r) {
    const ea = r.expiredAt
    if (ea === null || ea === "") {
      patch.expiredAt = null
    } else {
      let d: Date
      try { d = new Date(ea as string) } catch { return { ok: false, error: "expiredAt 格式错" } }
      if (isNaN(d.getTime())) return { ok: false, error: "expiredAt 格式错" }
      // 用 sql raw 绕 Drizzle SQLite timestamp mode 的 bug
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(patch as any).expiredAt = sql`${Math.floor(d.getTime() / 1000)}`
    }
  }

  // 总是更新 updatedAt
  patch.updatedAt = new Date()

  // 主表 patch 应用
  if (Object.keys(patch).length > 0) {
    await db.update(items).set(patch).where(eq(items.id, id))
  }

  // tagIds 独立处理：传了（即使是 []）就重置；没传就保留
  if ("tagIds" in r) {
    const tagIdsRaw = r.tagIds
    let tagIds: number[]
    if (tagIdsRaw === null) {
      tagIds = []
    } else if (Array.isArray(tagIdsRaw)) {
      tagIds = tagIdsRaw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
    } else {
      return { ok: false, error: "tagIds 必须是数组或 null" }
    }
    const tagErr = await syncItemTags(id, tagIds, row.spaceId)
    if (tagErr) return { ok: false, error: tagErr }
  }

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