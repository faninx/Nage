"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Package, MapPin, Tag as TagIcon, FolderTree, Users, Database } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

type Item = {
  href: string
  label: string
  // 内置图标按 href 自动选（避免从 server component 传 fn 到 client）
  key: "home" | "items" | "locations" | "tags" | "categories" | "members" | "data"
}

const ICON_MAP: Record<Item["key"], LucideIcon> = {
  home: Home,
  items: Package,
  locations: MapPin,
  tags: TagIcon,
  categories: FolderTree,
  members: Users,
  data: Database,
}

export function NavLinks({
  items,
  mobile = false,
}: {
  items: Item[]
  mobile?: boolean
}) {
  const pathname = usePathname()

  if (mobile) {
    return (
      <ul className="flex justify-around items-stretch h-16">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = ICON_MAP[item.key]
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "h-full flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        const Icon = ICON_MAP[item.key]
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
