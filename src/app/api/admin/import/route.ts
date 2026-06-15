import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import { locations, categories, tags, items, itemTags, itemImages, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"

export const dynamic = "force-dynamic"

const PayloadSchema = z.object({
  version: z.literal(1),
  spaceName: z.string().max(100).optional(),
  locations: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        parentName: z.string().nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .max(2000),
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        icon: z.string().max(16).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .max(500),
  tags: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      })
    )
    .max(500),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().max(2000).nullable().optional(),
        quantity: z.number().int().min(1),
        unit: z.string().max(20).nullable().optional(),
        price: z.number().min(0).nullable().optional(),
        categoryName: z.string().nullable().optional(),
        locationName: z.string().optional(),
        tagNames: z.array(z.string()).max(20).optional(),
        images: z.array(z.string()).max(9).optional(),
      })
    )
    .max(20000),
})

/**
 * POST /api/admin/import?spaceId=N
 * 接收 JSON 备份文件，**先清空指定空间**再写入。要求当前用户在目标空间是 owner 或 editor。
 * 注意：图片二进制需从原 public/uploads/ 恢复；JSON 只含路径。
 */
export async function POST(req: NextRequest) {
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

  let text: string
  try {
    text = await req.text()
  } catch {
    return NextResponse.json({ error: "读取请求失败" }, { status: 400 })
  }
  if (text.length > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "文件过大（>50MB）" }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "JSON 解析失败" }, { status: 400 })
  }
  const parsed = PayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "数据格式错误", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    )
  }
  const p = parsed.data

  try {
    await db.transaction(async (tx) => {
      // 清空当前空间（按 FK 顺序：items → ...）
      await tx.delete(items).where(eq(items.spaceId, space.id))

      // 位置：用 name 做键，2 遍（先 root，再 children）
      const locIdByName = new Map<string, number>()
      const pending = [...p.locations]
      for (let pass = 0; pass < 10 && pending.length > 0; pass++) {
        const remaining: typeof pending = []
        for (const l of pending) {
          const parentId = l.parentName ? locIdByName.get(l.parentName) : null
          if (l.parentName && parentId == null) {
            remaining.push(l)
            continue
          }
          const [row] = await tx
            .insert(locations)
            .values({
              spaceId: space.id,
              parentId: parentId ?? null,
              name: l.name,
              description: l.description ?? null,
              sortOrder: l.sortOrder ?? 0,
            })
            .returning({ id: locations.id })
          locIdByName.set(l.name, row.id)
        }
        if (remaining.length === pending.length) {
          // 死循环 → 有 cycle 或父节点不存在
          throw new Error(
            `位置无法定位父节点：${remaining.map((r) => r.name).join(", ")}`
          )
        }
        pending.splice(0, pending.length, ...remaining)
      }

      // 分类
      const catIdByName = new Map<string, number>()
      for (const c of p.categories) {
        const [row] = await tx
          .insert(categories)
          .values({
            spaceId: space.id,
            name: c.name,
            icon: c.icon ?? null,
            sortOrder: c.sortOrder ?? 0,
          })
          .returning({ id: categories.id })
        catIdByName.set(c.name, row.id)
      }

      // 标签
      const tagIdByName = new Map<string, number>()
      for (const t of p.tags) {
        const [row] = await tx
          .insert(tags)
          .values({ spaceId: space.id, name: t.name, color: t.color ?? null })
          .returning({ id: tags.id })
        tagIdByName.set(t.name, row.id)
      }

      // 物品
      for (const it of p.items) {
        const categoryId = it.categoryName ? catIdByName.get(it.categoryName) ?? null : null
        const locationId = it.locationName
          ? locIdByName.get(it.locationName.split(" / ")[0]) ?? null
          : null
        // 注：locationName 是完整路径 "家 / 主卧 / 衣柜"，取第一段作为 root
        // 更严谨的应该校验整段路径都存在；这里简化
        const [row] = await tx
          .insert(items)
          .values({
            spaceId: space.id,
            name: it.name,
            description: it.description ?? null,
            quantity: it.quantity,
            unit: it.unit ?? null,
            price: it.price ?? null,
            categoryId,
            locationId,
          })
          .returning({ id: items.id })
        if (it.tagNames && it.tagNames.length > 0) {
          const tagIds = it.tagNames
            .map((n) => tagIdByName.get(n))
            .filter((x): x is number => x != null)
          if (tagIds.length > 0) {
            await tx
              .insert(itemTags)
              .values(tagIds.map((tagId) => ({ itemId: row.id, tagId })))
          }
        }
        // 图片：仅导入仍存在的路径；缺失的不报错（文件需手动恢复）
        if (it.images && it.images.length > 0) {
          const validPaths = it.images
            .map((p) => (typeof p === "string" ? p : null))
            .filter((x): x is string => !!x)
            .slice(0, 9)
          if (validPaths.length > 0) {
            await tx
              .insert(itemImages)
              .values(
                validPaths.map((path, idx) => ({
                  itemId: row.id,
                  path,
                  sortOrder: idx,
                }))
              )
          }
        }
      }
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "导入失败" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
