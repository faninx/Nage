import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth/session"
import { logoutAction } from "../(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { locations } from "@/lib/db/schema"
import { ensureDefaultSpace } from "@/lib/actions/spaces"
import Link from "next/link"
import { NavLinks } from "@/components/layout/nav-links"
import { UserMenu } from "@/components/layout/user-menu"
import { QuickAddFab } from "@/components/layout/quick-add-fab"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import type { LocNode } from "@/components/location-tree-select"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireSession()
  const spaceId = await ensureDefaultSpace(user.id)

  // 给全局 FAB 用：当前空间的位置列表（通常 < 100 条，传 props 简单）
  const userLocations: LocNode[] = await db
    .select({
      id: locations.id,
      name: locations.name,
      parentId: locations.parentId,
      sortOrder: locations.sortOrder,
    })
    .from(locations)
    .where(eq(locations.spaceId, spaceId))
    .orderBy(locations.sortOrder, locations.id)

  type NavKey = "home" | "items" | "locations" | "categories" | "tags" | "members" | "data"
  const navItems: { href: string; label: string; key: NavKey }[] = [
    { href: "/", label: "首页", key: "home" },
    { href: "/items", label: "物品", key: "items" },
    { href: "/locations", label: "位置", key: "locations" },
    { href: "/categories", label: "分类", key: "categories" },
    { href: "/tags", label: "标签", key: "tags" },
  ]
  if (user.role === "admin") {
    navItems.push({ href: "/admin/members", label: "成员", key: "members" })
    navItems.push({ href: "/admin/data", label: "数据", key: "data" })
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* 顶栏 */}
      <header className="border-b bg-background sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
          <Link href="/" className="font-semibold text-lg">
            纳格
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <UserMenu nickname={user.nickname} isAdmin={user.role === "admin"} />
            </div>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                登出
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        {/* 侧栏（PC） */}
        <aside className="hidden md:block w-56 shrink-0 border-r py-4 pr-2">
          <NavLinks items={navItems} />
        </aside>

        {/* 主区 */}
        <main className="flex-1 min-w-0 px-4 py-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* 底部 Tab（移动） */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t bg-background">
        <NavLinks items={navItems.slice(0, 5)} mobile />
      </nav>

      {/* 全局悬浮 + 按钮（避开 Dialog z-50 用 z-30） */}
      <QuickAddFab spaceId={spaceId} locations={userLocations} />
    </div>
  )
}
