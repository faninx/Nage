import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tags, itemTags } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getCurrentSpaceId } from "@/lib/auth/space-access"
import { TagsClient } from "./tags-client"

export default async function TagsPage() {
  const user = await requireSession()
  const spaceId = await getCurrentSpaceId(user.id)

  const list = await db
    .select({
      id: tags.id,
      spaceId: tags.spaceId,
      name: tags.name,
      color: tags.color,
      itemCount: sql<number>`COALESCE(COUNT(${itemTags.itemId}), 0)`.as("item_count"),
    })
    .from(tags)
    .leftJoin(itemTags, eq(itemTags.tagId, tags.id))
    .where(eq(tags.spaceId, spaceId))
    .groupBy(tags.id)
    .orderBy(tags.id)

  return <TagsClient spaceId={spaceId} initial={list} />
}
