import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tags, itemTags, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ensureDefaultSpace } from "@/lib/actions/spaces"
import { TagsClient } from "./tags-client"

export default async function TagsPage() {
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
