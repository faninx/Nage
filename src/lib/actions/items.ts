"use server"

import { revalidatePath } from "next/cache"
import { rm } from "node:fs/promises"
import path from "node:path"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { items, categories, locations, itemTags, tags, itemImages, type SpaceRole } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateItemSchema,
  UpdateItemSchema,
  DeleteItemSchema,
  DeleteItemsSchema,
  ItemListSearchSchema,
} from "@/lib/validation/schemas"
import { uploadItemImages } from "./images"
import { queryItems, queryItemById, type SearchResult } from "@/lib/db/items-query"
import type { ActionState } from "./types"

async function getItemSpaceId(itemId: number): Promise<number | null> {
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1)
  return row?.spaceId ?? null
}

async function userAccessToItem(
  userId: number,
  itemId: number,
  minRole: SpaceRole = "editor"
): Promise<{ ok: boolean; spaceId: number | null }> {
  const spaceId = await getItemSpaceId(itemId)
  if (!spaceId) return { ok: false, spaceId: null }
  const ok = await hasSpaceAccess(userId, spaceId, minRole)
  return { ok, spaceId }
}

async function validateTagOwnership(tagIds: number[], spaceId: number): Promise<string | null> {
  if (tagIds.length === 0) return null
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inArray(tags.id, tagIds), eq(tags.spaceId, spaceId)))
  if (rows.length !== tagIds.length) {
    return "所选标签不存在或不属于该空间"
  }
  return null
}

async function cleanupItemDisk(itemId: number) {
  const dir = path.join(process.cwd(), "public", "uploads", "items", String(itemId))
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

async function syncItemTags(itemId: number, desiredTagIds: number[], spaceId: number) {
  if (desiredTagIds.length === 0) {
    await db.delete(itemTags).where(eq(itemTags.itemId, itemId))
    return
  }
  const current = await db
    .select({ tagId: itemTags.tagId })
    .from(itemTags)
    .where(eq(itemTags.itemId, itemId))
  const currentSet = new Set(current.map((r) => r.tagId))
  const desiredSet = new Set(desiredTagIds)

  const toRemove = [...currentSet].filter((id) => !desiredSet.has(id))
  const toAdd = [...desiredSet].filter((id) => !currentSet.has(id))

  if (toRemove.length > 0) {
    await db
      .delete(itemTags)
      .where(and(eq(itemTags.itemId, itemId), inArray(itemTags.tagId, toRemove)))
  }
  if (toAdd.length > 0) {
    const err = await validateTagOwnership(toAdd, spaceId)
    if (err) throw new Error(err)
    await db.insert(itemTags).values(toAdd.map((tagId) => ({ itemId, tagId })))
  }
}

/**
 * 按 desiredOrderIds 重排指定 item 已有的图片 sortOrder。
 * - 空数组 → 不动（保持向后兼容 / 客户端没传字段时）
 * - 长度不等 / 含不属于该 item 的 id / 重复 → 拒绝（return error）
 * - 通过后逐条 UPDATE sortOrder = 数组下标
 *
 * 必须在 uploadItemImages 之前调：先固化现有图顺序，新上传的图走 max+1 追加末尾。
 */
async function syncItemImageOrder(
  itemId: number,
  desiredOrderIds: number[]
): Promise<string | null> {
  if (desiredOrderIds.length === 0) return null
  const current = await db
    .select({ id: itemImages.id })
    .from(itemImages)
    .where(eq(itemImages.itemId, itemId))
  if (current.length !== desiredOrderIds.length) {
    return `图片数量不匹配（期望 ${desiredOrderIds.length}，实际 ${current.length}）`
  }
  const currentSet = new Set(current.map((r) => r.id))
  for (const id of desiredOrderIds) {
    if (!currentSet.has(id)) return `图片 #${id} 不属于该物品`
  }
  for (let i = 0; i < desiredOrderIds.length; i++) {
    await db
      .update(itemImages)
      .set({ sortOrder: i })
      .where(and(eq(itemImages.id, desiredOrderIds[i]), eq(itemImages.itemId, itemId)))
  }
  return null
}

export async function createItemAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = CreateItemSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    locationId: formData.get("locationId") || undefined,
    quantity: formData.get("quantity") || 1,
    unit: formData.get("unit") || undefined,
    price: formData.get("price") || "",
    tagIds: formData.get("tagIds") || "",
    expiredAt: formData.get("expiredAt") || "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, name, description, categoryId, locationId, quantity, unit, price, tagIds, expiredAt } = parsed.data

  if (!(await hasSpaceAccess(user.id, spaceId, "editor"))) {
    return { error: "无权操作该空间" }
  }

  if (categoryId) {
    const [c] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.spaceId, spaceId)))
      .limit(1)
    if (!c) return { error: "所选分类不存在或不属于该空间" }
  }
  if (locationId) {
    const [l] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.spaceId, spaceId)))
      .limit(1)
    if (!l) return { error: "所选位置不存在或不属于该空间" }
  }
  const tagErr = await validateTagOwnership(tagIds, spaceId)
  if (tagErr) return { error: tagErr }

  const [created] = await db
    .insert(items)
    .values({
      spaceId,
      name,
      description: description || null,
      categoryId: categoryId ?? null,
      locationId: locationId ?? null,
      quantity,
      unit: unit || null,
      price: price ?? null,
      expiredAt: expiredAt ?? null,
    })
    .returning({ id: items.id })

  if (tagIds.length > 0) {
    try {
      await db.insert(itemTags).values(tagIds.map((tagId) => ({ itemId: created.id, tagId })))
    } catch (e) {
      return { error: `标签关联失败：${e instanceof Error ? e.message : String(e)}` }
    }
  }

  try {
    await uploadItemImages(created.id, formData)
  } catch (e) {
    return { error: `图片上传失败：${e instanceof Error ? e.message : String(e)}` }
  }

  revalidatePath("/items")
  revalidatePath("/")
  return { ok: true }
}

export async function updateItemAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = UpdateItemSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    locationId: formData.get("locationId") || undefined,
    quantity: formData.get("quantity") || 1,
    unit: formData.get("unit") || undefined,
    price: formData.get("price") || "",
    tagIds: formData.get("tagIds") || "",
    expiredAt: formData.get("expiredAt") || "",
    imageOrder: formData.get("imageOrder") || "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, description, categoryId, locationId, quantity, unit, price, tagIds, expiredAt, imageOrder } = parsed.data

  const access = await userAccessToItem(user.id, id, "editor")
  if (!access.ok) return { error: "物品不存在或无权操作" }
  const { spaceId } = access

  if (categoryId) {
    const [c] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.spaceId, spaceId!)))
      .limit(1)
    if (!c) return { error: "所选分类不存在或不属于该空间" }
  }
  if (locationId) {
    const [l] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.spaceId, spaceId!)))
      .limit(1)
    if (!l) return { error: "所选位置不存在或不属于该空间" }
  }

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
      expiredAt: expiredAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(items.id, id))

  try {
    await syncItemTags(id, tagIds, spaceId!)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "标签关联失败" }
  }

  // 先固化现有图顺序，新上传的图走 max+1 自动追加到末尾
  const orderErr = await syncItemImageOrder(id, imageOrder)
  if (orderErr) return { error: orderErr }

  try {
    await uploadItemImages(id, formData)
  } catch (e) {
    return { error: `图片上传失败：${e instanceof Error ? e.message : String(e)}` }
  }

  revalidatePath("/items")
  revalidatePath(`/items/${id}`)
  return { ok: true }
}

export async function deleteItemAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteItemSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  const access = await userAccessToItem(user.id, id, "editor")
  if (!access.ok) return { error: "物品不存在或无权操作" }

  await db.delete(items).where(eq(items.id, id))
  await cleanupItemDisk(id)
  revalidatePath("/items")
  revalidatePath("/")
  return { ok: true }
}

export async function deleteItemsAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const raw = formData.get("ids")
  const ids = String(raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const parsed = DeleteItemsSchema.safeParse({ ids })
  if (!parsed.success) return { error: "参数错误" }

  // 取所有 item 的 spaceId，逐个校验权限
  const rows = await db
    .select({ id: items.id, spaceId: items.spaceId })
    .from(items)
    .where(inArray(items.id, parsed.data.ids))
  if (rows.length !== parsed.data.ids.length) {
    return { error: "部分物品不存在或无权操作" }
  }
  for (const r of rows) {
    if (!(await hasSpaceAccess(user.id, r.spaceId, "editor"))) {
      return { error: "无权操作" }
    }
  }

  await db.delete(items).where(inArray(items.id, parsed.data.ids))
  for (const id of parsed.data.ids) {
    await cleanupItemDisk(id)
  }
  revalidatePath("/items")
  revalidatePath("/")
  return { ok: true }
}

export async function getItemAction(input: {
  spaceId: number
  id: number
}): Promise<{
  item: import("@/lib/db/items-query").ItemRowDTO | null
  images: import("@/lib/db/items-query").ItemImageDTO[]
  tagIds: number[]
}> {
  const user = await requireSession()
  if (!(await hasSpaceAccess(user.id, input.spaceId, "viewer"))) {
    throw new Error("无权操作该空间")
  }
  const { item, images } = await queryItemById(input.spaceId, input.id)
  let tagIds: number[] = []
  if (item) {
    const rows = await db
      .select({ tagId: itemTags.tagId })
      .from(itemTags)
      .where(eq(itemTags.itemId, input.id))
    tagIds = rows.map((r) => r.tagId)
  }
  return { item, images, tagIds }
}

export async function searchItemsAction(input: {
  spaceId: number
  q?: string
  cat?: number | null
  loc?: number[] | null
  tag?: number[] | null
  sort?: "updated" | "name" | "created"
  page?: number
  exp?: "expired" | "7d" | "30d" | "all"
}): Promise<SearchResult> {
  const user = await requireSession()
  const parsed = ItemListSearchSchema.partial().safeParse({
    q: input.q,
    cat: input.cat ?? undefined,
    loc: input.loc ?? undefined,
    tag: input.tag ?? undefined,
    sort: input.sort,
    page: input.page,
    exp: input.exp,
  })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "参数错误")
  }
  if (!(await hasSpaceAccess(user.id, input.spaceId, "viewer"))) {
    throw new Error("无权操作该空间")
  }
  return queryItems({
    spaceId: input.spaceId,
    q: parsed.data.q ?? "",
    cat: parsed.data.cat ?? null,
    loc: parsed.data.loc ?? null,
    tag: parsed.data.tag ?? null,
    sort: parsed.data.sort ?? "updated",
    page: parsed.data.page ?? 1,
    exp: parsed.data.exp ?? "all",
  })
}
