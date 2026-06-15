import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, locations, tags } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getCurrentSpaceId } from "@/lib/auth/space-access"
import { ItemListSearchSchema } from "@/lib/validation/schemas"
import { queryItems, PAGE_SIZE, expandLocationIds } from "@/lib/db/items-query"
import { ItemsClient } from "./items-client"
import type { LocNode } from "@/components/location-tree-select"
import type { TagOpt } from "@/components/tags-multi-select"

export default async function ItemsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireSession()
  const spaceId = await getCurrentSpaceId(user.id)

  const raw = await props.searchParams
  const sp = ItemListSearchSchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    cat: typeof raw.cat === "string" ? raw.cat : undefined,
    loc: raw.loc,
    tag: raw.tag,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
    exp: typeof raw.exp === "string" ? raw.exp : undefined,
  })
  const initialFilters = sp.success
    ? {
        q: sp.data.q ?? "",
        cat: sp.data.cat ?? null,
        loc: sp.data.loc ?? null,
        tag: sp.data.tag ?? null,
        sort: sp.data.sort,
        page: sp.data.page,
        exp: sp.data.exp,
      }
    : {
        q: "",
        cat: null,
        loc: null,
        tag: null,
        sort: "updated" as const,
        page: 1,
        exp: "all" as const,
      }

  // 位置筛选：自动展开到所有后代（点击位置 X 时，希望包含 X 的所有子位置）
  const expandedLoc =
    initialFilters.loc && initialFilters.loc.length > 0
      ? await expandLocationIds(spaceId, initialFilters.loc)
      : initialFilters.loc
  const finalFilters = { ...initialFilters, loc: expandedLoc }

  const initial = await queryItems({
    spaceId,
    q: finalFilters.q,
    cat: finalFilters.cat,
    loc: finalFilters.loc,
    tag: finalFilters.tag,
    sort: finalFilters.sort,
    page: finalFilters.page,
    exp: finalFilters.exp,
  })

  const allLocations: LocNode[] = (
    await db
      .select()
      .from(locations)
      .where(eq(locations.spaceId, spaceId))
      .orderBy(locations.sortOrder, locations.id)
  ).map((l) => ({ id: l.id, name: l.name, parentId: l.parentId, sortOrder: l.sortOrder }))

  const [allCategories, allTags] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.spaceId, spaceId))
      .orderBy(categories.sortOrder, categories.id),
    db
      .select()
      .from(tags)
      .where(eq(tags.spaceId, spaceId))
      .orderBy(tags.id),
  ])

  const tagOpts: TagOpt[] = allTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))

  return (
    <ItemsClient
      spaceId={spaceId}
      initialFilters={finalFilters}
      initial={initial}
      categories={allCategories}
      locations={allLocations}
      tags={tagOpts}
      pageSize={PAGE_SIZE}
    />
  )
}
