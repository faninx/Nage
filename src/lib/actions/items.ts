"use server"

import { revalidatePath } from "next/cache"
import { rm } from "node:fs/promises"
import path from "node:path"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { items, spaces, categories, locations, itemTags, tags } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
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

async function userOwnsSpace(userId: number, spaceId: number): Promise<boolean> {
  const [own] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, userId)))
    .limit(1)
  return !!own
}

async function userOwnsItem(userId: number, itemId: number): Promise<{ spaceId: number } | null> {
  const [row] = await db
    .select({ spaceId: items.spaceId, ownerId: spaces.ownerId })
    .from(items)
    .innerJoin(spaces, eq(items.spaceId, spaces.id))
    .where(eq(items.id, itemId))
    .limit(1)
  if (!row || row.ownerId !== userId) return null
  return { spaceId: row.spaceId }
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

  if (!(await userOwnsSpace(user.id, spaceId))) {
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
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, description, categoryId, locationId, quantity, unit, price, tagIds, expiredAt } = parsed.data

  const own = await userOwnsItem(user.id, id)
  if (!own) return { error: "物品不存在或无权操作" }
  const { spaceId } = own

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
    await syncItemTags(id, tagIds, spaceId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "标签关联失败" }
  }

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

  const own = await userOwnsItem(user.id, id)
  if (!own) return { error: "物品不存在或无权操作" }

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

  const owned = await db
    .select({ id: items.id, spaceId: items.spaceId, ownerId: spaces.ownerId })
    .from(items)
    .innerJoin(spaces, eq(items.spaceId, spaces.id))
    .where(inArray(items.id, parsed.data.ids))
  if (owned.length !== parsed.data.ids.length) {
    return { error: "部分物品不存在或无权操作" }
  }
  if (owned.some((r) => r.ownerId !== user.id)) {
    return { error: "无权操作" }
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
  if (!(await userOwnsSpace(user.id, input.spaceId))) {
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
  if (!(await userOwnsSpace(user.id, input.spaceId))) {
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
