import { notFound } from "next/navigation"
import { eq, asc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  items,
  categories,
  locations,
  itemImages,
  itemTags,
  tags,
  spaces,
} from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ItemDetailClient, type ItemDetail, type LocBreadcrumb } from "./item-detail-client"
import type { LocNode } from "@/components/location-tree-select"
import type { Tag as DbTag } from "@/lib/db/schema"

export default async function ItemDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireSession()
  const { id: idStr } = await props.params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const [row] = await db
    .select({
      id: items.id,
      spaceId: items.spaceId,
      name: items.name,
      description: items.description,
      categoryId: items.categoryId,
      locationId: items.locationId,
      quantity: items.quantity,
      unit: items.unit,
      price: items.price,
      expiredAt: items.expiredAt,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
      ownerId: spaces.ownerId,
    })
    .from(items)
    .innerJoin(spaces, eq(items.spaceId, spaces.id))
    .where(eq(items.id, id))
    .limit(1)
  if (!row) notFound()
  if (row.ownerId !== user.id) notFound()

  const [cat, loc, imgs, itemTagRows] = await Promise.all([
    row.categoryId
      ? db
          .select({ id: categories.id, name: categories.name, icon: categories.icon })
          .from(categories)
          .where(eq(categories.id, row.categoryId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.locationId
      ? db
          .select()
          .from(locations)
          .where(eq(locations.id, row.locationId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select({ id: itemImages.id, path: itemImages.path, sortOrder: itemImages.sortOrder })
      .from(itemImages)
      .where(eq(itemImages.itemId, id))
      .orderBy(asc(itemImages.sortOrder)),
    db
      .select({ tagId: itemTags.tagId })
      .from(itemTags)
      .where(eq(itemTags.itemId, id)),
  ])

  // 位置面包屑（从根到自己）
  const breadcrumb: LocBreadcrumb[] = []
  if (loc) {
    const all: LocNode[] = (
      await db
        .select()
        .from(locations)
        .where(eq(locations.spaceId, row.spaceId))
        .orderBy(locations.sortOrder, locations.id)
    ).map((l) => ({ id: l.id, name: l.name, parentId: l.parentId, sortOrder: l.sortOrder }))
    const byId = new Map(all.map((l) => [l.id, l]))
    let cur: LocNode | undefined = byId.get(loc.id)
    const path: LocNode[] = []
    let guard = 0
    while (cur && guard++ < 10) {
      path.unshift(cur)
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
    }
    for (const p of path) {
      breadcrumb.push({ id: p.id, name: p.name })
    }
  }

  // 标签
  let itemTagsList: { id: number; name: string; color: string | null }[] = []
  if (itemTagRows.length > 0) {
    const ids = itemTagRows.map((r) => r.tagId)
    const tagRows: DbTag[] = await db.select().from(tags).where(inArray(tags.id, ids))
    itemTagsList = tagRows
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      .map((t) => ({ id: t.id, name: t.name, color: t.color }))
  }

  // 编辑表单需要的选项：所有分类 / 位置 / 标签（保证 form 能用上当前空间所有可选项）
  const [allCategories, allTags, allLocationRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.spaceId, row.spaceId))
      .orderBy(categories.sortOrder, categories.id),
    db
      .select()
      .from(tags)
      .where(eq(tags.spaceId, row.spaceId))
      .orderBy(tags.id),
    db
      .select()
      .from(locations)
      .where(eq(locations.spaceId, row.spaceId))
      .orderBy(locations.sortOrder, locations.id),
  ])
  const allLocations: LocNode[] = allLocationRows.map((l) => ({
    id: l.id,
    name: l.name,
    parentId: l.parentId,
    sortOrder: l.sortOrder,
  }))

  // 服务端算"距今多少天"，避免 client 调 Date.now() 触发 react-hooks/purity
  const daysUntilExpired: number | null = row.expiredAt
    ? Math.ceil(
        // eslint-disable-next-line react-hooks/purity
        (row.expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null

  const detail: ItemDetail = {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    price: row.price,
    categoryId: row.categoryId,
    locationId: row.locationId,
    category: cat
      ? { id: cat.id, name: cat.name, icon: cat.icon }
      : null,
    breadcrumb,
    tags: itemTagsList,
    images: imgs.map((im) => ({ id: im.id, path: im.path, sortOrder: im.sortOrder })),
    expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
    daysUntilExpired,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  return (
    <ItemDetailClient
      item={detail}
      categories={allCategories}
      locations={allLocations}
      tags={allTags}
    />
  )
}
