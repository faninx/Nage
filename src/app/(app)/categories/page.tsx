import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, items, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ensureDefaultSpace } from "@/lib/actions/spaces"
import { CategoriesClient } from "./categories-client"

export default async function CategoriesPage() {
  const user = await requireSession()
  const spaceId = await ensureDefaultSpace(user.id)

  // 二次校验：确保 user 确实拥有这个 space
  const [own] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id)))
    .limit(1)
  if (!own) {
    throw new Error("空间归属校验失败")
  }

  const list = await db
    .select({
      id: categories.id,
      spaceId: categories.spaceId,
      name: categories.name,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      itemCount: sql<number>`COALESCE(COUNT(${items.id}), 0)`.as("item_count"),
    })
    .from(categories)
    .leftJoin(items, eq(items.categoryId, categories.id))
    .where(eq(categories.spaceId, spaceId))
    .groupBy(categories.id)
    .orderBy(categories.sortOrder, categories.id)

  return <CategoriesClient spaceId={spaceId} initial={list} />
}
