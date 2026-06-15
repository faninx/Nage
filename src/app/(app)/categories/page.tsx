import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, items } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getCurrentSpaceId } from "@/lib/auth/space-access"
import { CategoriesClient } from "./categories-client"

export default async function CategoriesPage() {
  const user = await requireSession()
  const spaceId = await getCurrentSpaceId(user.id)

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
