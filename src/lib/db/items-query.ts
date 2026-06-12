import "server-only"
import { eq, and, or, like, sql, asc, desc, inArray } from "drizzle-orm"
import { db } from "./index"
import { items, categories, locations, itemImages, itemTags, tags } from "./schema"

export const PAGE_SIZE = 20

export type ItemListSort = "updated" | "name" | "created"

export type ItemListInput = {
  spaceId: number
  q: string
  cat: number | null
  loc: number[] | null
  tag: number[] | null
  sort: ItemListSort
  page: number
  exp: "expired" | "7d" | "30d" | "all"
}

export type ItemRowDTO = {
  id: number
  name: string
  description: string | null
  quantity: number
  unit: string | null
  price: number | null
  categoryId: number | null
  locationId: number | null
  categoryName: string | null
  locationName: string | null
  expiredAt: string | null // ISO
  /** 正数=N 天后过期；0=今日；负数=已过期 N 天；null=未设置（服务端算好，client 不用再 Date.now） */
  daysUntilExpired: number | null
  updatedAt: string // ISO
}

export type ItemImageDTO = {
  id: number
  path: string
  sortOrder: number
}

export type ItemTagDTO = {
  id: number
  name: string
  color: string | null
}

export type SearchResult = {
  items: ItemRowDTO[]
  total: number
  totalPages: number
  page: number
  firstImages: Record<number, string>
  imagesByItem: Record<number, ItemImageDTO[]>
  tagsByItem: Record<number, ItemTagDTO[]>
}

export async function queryItems(input: ItemListInput): Promise<SearchResult> {
  const { spaceId, q, cat, loc, tag, sort, page, exp } = input
  const conditions = [eq(items.spaceId, spaceId)]
  if (q) {
    const like_ = `%${q}%`
    conditions.push(or(like(items.name, like_), like(items.description, like_))!)
  }
  if (cat != null) conditions.push(eq(items.categoryId, cat))
  if (loc != null && loc.length > 0) conditions.push(inArray(items.locationId, loc))
  if (exp !== "all") {
    const nowSec = Math.floor(Date.now() / 1000)
    if (exp === "expired") {
      // 已过期：expiredAt 不为 null 且 < now
      conditions.push(sql`${items.expiredAt} IS NOT NULL AND ${items.expiredAt} < ${nowSec}`)
    } else {
      const days = exp === "7d" ? 7 : 30
      const futureSec = nowSec + days * 24 * 60 * 60
      // N 天内过期：expiredAt 在 [now, now+days] 之间
      conditions.push(
        sql`${items.expiredAt} IS NOT NULL AND ${items.expiredAt} >= ${nowSec} AND ${items.expiredAt} <= ${futureSec}`
      )
    }
  }
  if (tag != null && tag.length > 0) {
    // OR 语义：含任一选中标签的物品
    const matched = await db
      .selectDistinct({ itemId: itemTags.itemId })
      .from(itemTags)
      .where(inArray(itemTags.tagId, tag))
    if (matched.length === 0) {
      // 没有匹配 → 空集
      return {
        items: [],
        total: 0,
        totalPages: 1,
        page: 1,
        firstImages: {},
        imagesByItem: {},
        tagsByItem: {},
      }
    }
    conditions.push(inArray(items.id, matched.map((m) => m.itemId)))
  }
  const where = and(...conditions)

  // 总数
  const [totalRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(items)
    .where(where)
  const total = totalRow?.c ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const offset = (safePage - 1) * PAGE_SIZE

  // 排序
  const orderDir =
    sort === "name"
      ? asc(items.name)
      : sort === "created"
        ? desc(items.createdAt)
        : desc(items.updatedAt)

  // 主查询
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      description: items.description,
      quantity: items.quantity,
      unit: items.unit,
      price: items.price,
      categoryId: items.categoryId,
      locationId: items.locationId,
      categoryName: categories.name,
      locationName: locations.name,
      expiredAt: items.expiredAt,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(locations, eq(items.locationId, locations.id))
    .where(where)
    .orderBy(orderDir)
    .limit(PAGE_SIZE)
    .offset(offset)

  const itemRows: ItemRowDTO[] = (() => {
    const nowMs = Date.now()
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      price: r.price,
      categoryId: r.categoryId,
      locationId: r.locationId,
      categoryName: r.categoryName,
      locationName: r.locationName,
      expiredAt: r.expiredAt ? r.expiredAt.toISOString() : null,
      daysUntilExpired: r.expiredAt
        ? Math.ceil((r.expiredAt.getTime() - nowMs) / (1000 * 60 * 60 * 24))
        : null,
      updatedAt: r.updatedAt.toISOString(),
    }))
  })()

  // 图片
  const itemIds = itemRows.map((r) => r.id)
  const firstImages: Record<number, string> = {}
  const imagesByItem: Record<number, ItemImageDTO[]> = {}
  const tagsByItem: Record<number, ItemTagDTO[]> = {}
  if (itemIds.length > 0) {
    const [imgs, tgs] = await Promise.all([
      db
        .select({
          id: itemImages.id,
          itemId: itemImages.itemId,
          path: itemImages.path,
          sortOrder: itemImages.sortOrder,
        })
        .from(itemImages)
        .where(inArray(itemImages.itemId, itemIds))
        .orderBy(itemImages.itemId, itemImages.sortOrder),
      db
        .select({
          itemId: itemTags.itemId,
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(itemTags)
        .innerJoin(tags, eq(itemTags.tagId, tags.id))
        .where(inArray(itemTags.itemId, itemIds)),
    ])
    for (const im of imgs) {
      if (!imagesByItem[im.itemId]) imagesByItem[im.itemId] = []
      imagesByItem[im.itemId].push({
        id: im.id,
        path: im.path,
        sortOrder: im.sortOrder,
      })
    }
    for (const [itemId, arr] of Object.entries(imagesByItem)) {
      if (arr.length > 0) firstImages[Number(itemId)] = arr[0].path
    }
    for (const t of tgs) {
      if (!tagsByItem[t.itemId]) tagsByItem[t.itemId] = []
      tagsByItem[t.itemId].push({ id: t.id, name: t.name, color: t.color })
    }
  }

  return { items: itemRows, total, totalPages, page: safePage, firstImages, imagesByItem, tagsByItem }
}

/**
 * 把一组位置 id 展开为「自身 + 所有后代 id」，限定在指定空间内。
 * 用于：点击位置 X 跳到 /items?loc=X 时，自动包含 X 的所有子位置物品。
 */
export async function expandLocationIds(spaceId: number, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: locations.id, parentId: locations.parentId })
    .from(locations)
    .where(eq(locations.spaceId, spaceId))
  const childrenByParent = new Map<number, number[]>()
  for (const l of rows) {
    if (l.parentId != null) {
      const arr = childrenByParent.get(l.parentId) ?? []
      arr.push(l.id)
      childrenByParent.set(l.parentId, arr)
    }
  }
  const out = new Set<number>()
  const visit = (id: number) => {
    if (out.has(id)) return
    out.add(id)
    for (const k of childrenByParent.get(id) ?? []) visit(k)
  }
  for (const id of ids) visit(id)
  return [...out]
}

/** 按 id 拉单个物品 + 全量图片（编辑/详情用） */
export async function queryItemById(
  spaceId: number,
  id: number
): Promise<{ item: ItemRowDTO | null; images: ItemImageDTO[] }> {
  const [row] = await db
    .select({
      id: items.id,
      name: items.name,
      description: items.description,
      quantity: items.quantity,
      unit: items.unit,
      price: items.price,
      categoryId: items.categoryId,
      locationId: items.locationId,
      categoryName: categories.name,
      locationName: locations.name,
      expiredAt: items.expiredAt,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(locations, eq(items.locationId, locations.id))
    .where(and(eq(items.id, id), eq(items.spaceId, spaceId)))
    .limit(1)

  if (!row) return { item: null, images: [] }

  const imgs = await db
    .select({
      id: itemImages.id,
      path: itemImages.path,
      sortOrder: itemImages.sortOrder,
    })
    .from(itemImages)
    .where(eq(itemImages.itemId, id))
    .orderBy(itemImages.sortOrder)

  return {
    item: {
      id: row.id,
      name: row.name,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      price: row.price,
      categoryId: row.categoryId,
      locationId: row.locationId,
      categoryName: row.categoryName,
      locationName: row.locationName,
      expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
      daysUntilExpired: row.expiredAt
        ? Math.ceil((row.expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      updatedAt: row.updatedAt.toISOString(),
    },
    images: imgs.map((im) => ({ id: im.id, path: im.path, sortOrder: im.sortOrder })),
  }
}
