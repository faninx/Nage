import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { locations, items } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getCurrentSpaceId } from "@/lib/auth/space-access"
import { LocationsClient } from "./locations-client"

export default async function LocationsPage() {
  const user = await requireSession()
  const spaceId = await getCurrentSpaceId(user.id)

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
