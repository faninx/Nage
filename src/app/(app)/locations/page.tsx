import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { locations, items, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ensureDefaultSpace } from "@/lib/actions/spaces"
import { LocationsClient } from "./locations-client"

export default async function LocationsPage() {
  const user = await requireSession()
  const spaceId = await ensureDefaultSpace(user.id)

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
      id: locations.id,
      spaceId: locations.spaceId,
      parentId: locations.parentId,
      name: locations.name,
      description: locations.description,
      coverImage: locations.coverImage,
      sortOrder: locations.sortOrder,
      createdAt: locations.createdAt,
      itemCount: sql<number>`COALESCE(COUNT(${items.id}), 0)`.as("item_count"),
    })
    .from(locations)
    .leftJoin(items, eq(items.locationId, locations.id))
    .where(eq(locations.spaceId, spaceId))
    .groupBy(locations.id)
    .orderBy(locations.sortOrder, locations.id)

  return <LocationsClient spaceId={spaceId} initial={list} />
}
