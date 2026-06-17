import { eq, and, sql, desc } from "drizzle-orm"
import Image from "next/image"
import Link from "next/link"
import { db } from "@/lib/db"
import {
  items,
  locations,
  categories,
  tags,
  spaces,
  itemImages,
} from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getCurrentSpaceId } from "@/lib/auth/space-access"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Package, MapPin, FolderTree, Tag as TagIcon, ArrowRight } from "lucide-react"
import { ExpiringSoonCard } from "./expiring-soon-card"

export default async function DashboardPage() {
  const user = await requireSession()
  const spaceId = await getCurrentSpaceId(user.id)

  const [space] = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1)

  const [itemCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.spaceId, spaceId))
  const [locCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(locations)
    .where(eq(locations.spaceId, spaceId))
  const [catCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.spaceId, spaceId))
  const [tagCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(tags)
    .where(eq(tags.spaceId, spaceId))

  // 最近 5 件物品
  const recent = await db
    .select({
      id: items.id,
      name: items.name,
      quantity: items.quantity,
      unit: items.unit,
      locationName: locations.name,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .leftJoin(locations, eq(items.locationId, locations.id))
    .where(eq(items.spaceId, spaceId))
    .orderBy(desc(items.updatedAt))
    .limit(5)

  // 最近一件物品的首图
  const recentFirstImages: Record<number, string> = {}
  if (recent.length > 0) {
    const ids = recent.map((r) => r.id)
    const imgs = await db
      .select({ itemId: itemImages.itemId, path: itemImages.path, sortOrder: itemImages.sortOrder })
      .from(itemImages)
      .where(sql`${itemImages.itemId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
      .orderBy(itemImages.itemId, itemImages.sortOrder)
    for (const im of imgs) {
      if (!recentFirstImages[im.itemId]) recentFirstImages[im.itemId] = im.path
    }
  }

  // 快过期物品（30 天内 + 已过期，按到期时间升序）
  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000)
  const thirtyDaysSec = nowSec + 30 * 24 * 60 * 60
  const expiring = await db
    .select({
      id: items.id,
      name: items.name,
      expiredAt: items.expiredAt,
    })
    .from(items)
    .where(
      and(
        eq(items.spaceId, spaceId),
        sql`${items.expiredAt} IS NOT NULL AND ${items.expiredAt} <= ${thirtyDaysSec}`
      )
    )
    .orderBy(items.expiredAt)
    .limit(10)

  const expiringItems = expiring
    .filter((e) => e.expiredAt)
    .map((e) => ({ id: e.id, name: e.name, expiredAt: e.expiredAt! }))

  const stats = [
    { label: "物品", value: itemCount.c, hint: "收纳记录", icon: Package, href: "/items" as const },
    { label: "位置", value: locCount.c, hint: `${space?.name ?? ""} 内`, icon: MapPin, href: "/locations" as const },
    { label: "分类", value: catCount.c, hint: "归类维度", icon: FolderTree, href: "/categories" as const },
    { label: "标签", value: tagCount.c, hint: "多对多标记", icon: TagIcon, href: "/tags" as const },
  ]

  const allEmpty = locCount.c === 0 && catCount.c === 0 && tagCount.c === 0 && itemCount.c === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">欢迎，{user.nickname}</h1>
        <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
          <span>当前空间：{space?.name ?? "未命名"}</span>
          {user.role === "admin" && <Badge variant="secondary">管理员</Badge>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.label} href={s.href}>
              <Card className="hover:bg-muted/30 transition-colors h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-1.5">
                    <Icon className="size-4" />
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              最近更新
              <Button asChild variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs">
                <Link href="/items">
                  查看全部
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y -mx-2">
              {recent.map((r) => {
                const cover = recentFirstImages[r.id]
                return (
                  <li key={r.id}>
                    <Link
                      href={`/items/${r.id}`}
                      className="flex items-center gap-3 px-2 py-2 hover:bg-muted/30 rounded-md"
                    >
                      <div className="relative size-10 shrink-0 rounded overflow-hidden bg-muted border">
                        {cover ? (
                          <Image
                            src={cover}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center text-muted-foreground">
                            <Package className="size-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {r.name}
                          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                            ×{r.quantity}
                            {r.unit ? ` ${r.unit}` : ""}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.locationName ? `📍 ${r.locationName}` : "未指定位置"}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {new Date(r.updatedAt).toLocaleDateString("zh-CN")}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {expiringItems.length > 0 && <ExpiringSoonCard items={expiringItems} />}

      {allEmpty && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">开始使用</CardTitle>
            <CardDescription>
              建议先建位置和分类，然后用右下角「+」快速添加物品。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/locations">
                建位置（5 级树：家 → 房间 → 柜子 → 抽屉 → 盒子）
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/categories">
                建分类（用图标/颜色区分）
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/tags">
                建标签（多对多附加到物品）
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {user.role === "admin" && (
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/admin/members">
                  添加家庭成员
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
