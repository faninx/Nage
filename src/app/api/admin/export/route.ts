import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { locations, categories, tags, items, itemImages, itemTags, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/export?spaceId=N
 * 导出指定空间的全量数据为 JSON。要求当前用户在目标空间是 owner 或 editor。
 * 注意：图片二进制需单独备份 public/uploads/。
 */
export async function GET(req: NextRequest) {
  const me = await requireSession()
  const spaceId = Number(req.nextUrl.searchParams.get("spaceId"))
  if (!Number.isInteger(spaceId) || spaceId <= 0) {
    return NextResponse.json({ error: "缺少 spaceId 参数" }, { status: 400 })
  }
  if (!(await hasSpaceAccess(me.id, spaceId, "editor"))) {
    return NextResponse.json({ error: "无权操作该空间" }, { status: 403 })
  }
  const [space] = await db
    .select()
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1)
  if (!space) {
    return NextResponse.json({ error: "空间不存在" }, { status: 404 })
  }

  const [allLocs, allCats, allTags, allItems, allImgs, allItemTags] = await Promise.all([
    db.select().from(locations).where(eq(locations.spaceId, space.id)).orderBy(locations.id),
    db.select().from(categories).where(eq(categories.spaceId, space.id)).orderBy(categories.id),
    db.select().from(tags).where(eq(tags.spaceId, space.id)).orderBy(tags.id),
    db.select().from(items).where(eq(items.spaceId, space.id)).orderBy(items.id),
    db
      .select({
        id: itemImages.id,
        itemId: itemImages.itemId,
        path: itemImages.path,
        sortOrder: itemImages.sortOrder,
      })
      .from(itemImages)
      .innerJoin(items, eq(itemImages.itemId, items.id))
      .where(eq(items.spaceId, space.id))
      .orderBy(itemImages.itemId, itemImages.sortOrder),
    db
      .select({ itemId: itemTags.itemId, tagId: itemTags.tagId })
      .from(itemTags)
      .innerJoin(items, eq(itemTags.itemId, items.id))
      .where(eq(items.spaceId, space.id)),
  ])

  const byIdLoc = new Map(allLocs.map((l) => [l.id, l]))
  function locPath(id: number | null): string {
    if (id == null) return ""
    const path: string[] = []
    let cur = byIdLoc.get(id)
    let guard = 0
    while (cur && guard++ < 10) {
      path.unshift(cur.name)
      cur = cur.parentId != null ? byIdLoc.get(cur.parentId) : undefined
    }
    return path.join(" / ")
  }

  const tagById = new Map(allTags.map((t) => [t.id, t]))
  const itemTagMap = new Map<number, string[]>()
  for (const it of allItemTags) {
    const t = tagById.get(it.tagId)
    if (!t) continue
    const arr = itemTagMap.get(it.itemId) ?? []
    arr.push(t.name)
    itemTagMap.set(it.itemId, arr)
  }

  const imgsByItem = new Map<number, string[]>()
  for (const im of allImgs) {
    const arr = imgsByItem.get(im.itemId) ?? []
    arr.push(im.path)
    imgsByItem.set(im.itemId, arr)
  }

  const catById = new Map(allCats.map((c) => [c.id, c]))

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    spaceName: space.name,
    locations: allLocs.map((l) => ({
      name: l.name,
      parentName: l.parentId ? (byIdLoc.get(l.parentId)?.name ?? null) : null,
      description: l.description,
      sortOrder: l.sortOrder,
    })),
    categories: allCats.map((c) => ({
      name: c.name,
      icon: c.icon,
      sortOrder: c.sortOrder,
    })),
    tags: allTags.map((t) => ({ name: t.name, color: t.color })),
    items: allItems.map((it) => ({
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      price: it.price,
      categoryName: it.categoryId ? (catById.get(it.categoryId)?.name ?? null) : null,
      locationName: locPath(it.locationId),
      tagNames: itemTagMap.get(it.id) ?? [],
      images: imgsByItem.get(it.id) ?? [],
    })),
  }

  const filename = `nage-export-${space.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  // RFC 5987：非 ASCII 文件名必须用 filename*=UTF-8''<percent-encoded>，
  // 否则浏览器/Node 直接拒（"character > 255"）。filename= 留 ASCII 兜底。
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_")
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
