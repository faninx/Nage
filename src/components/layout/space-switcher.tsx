"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ChevronDown, Warehouse, Settings2, Plus } from "lucide-react"
import { setCurrentSpaceAction } from "@/lib/actions/space-switcher"
import type { SpaceRole } from "@/lib/db/schema"
import { ROLE_LABEL, ROLE_STYLE } from "@/lib/space-roles"
import { toast } from "sonner"
import Link from "next/link"

type SpaceOpt = {
  id: number
  name: string
  role: SpaceRole
  isOwner: boolean
}

type Props = {
  spaces: SpaceOpt[]
  currentSpaceId: number
}

export function SpaceSwitcher({ spaces, currentSpaceId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const current = spaces.find((s) => s.id === currentSpaceId) ?? spaces[0]

  function switchTo(spaceId: number) {
    if (spaceId === currentSpaceId) {
      setOpen(false)
      return
    }
    const fd = new FormData()
    fd.append("spaceId", String(spaceId))
    startTransition(async () => {
      const res = await setCurrentSpaceAction(undefined, fd)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none min-w-0",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          "data-[state=open]:bg-muted"
        )}
      >
        <Warehouse className="size-4 text-muted-foreground shrink-0" />
        <span className="font-medium truncate max-w-[10rem]">{current?.name ?? "—"}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          切换空间
        </DropdownMenuLabel>
        {spaces.map((s) => {
          const isCurrent = s.id === currentSpaceId
          return (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => switchTo(s.id)}
              className="flex items-center gap-2"
            >
              <Warehouse className="size-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{s.name}</span>
              {isCurrent && <span className="text-xs text-muted-foreground shrink-0">当前</span>}
              <Badge className={cn("shrink-0", ROLE_STYLE[s.role])}>
                {ROLE_LABEL[s.role]}
              </Badge>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        {current?.isOwner && (
          <DropdownMenuItem asChild>
            <Link href={`/spaces/${currentSpaceId}/settings`} className="flex items-center gap-2">
              <Settings2 className="size-4" />
              空间设置
            </Link>
          </DropdownMenuItem>
        )}
        {current?.isOwner && (
          <DropdownMenuItem asChild>
            <Link href="/spaces/new" className="flex items-center gap-2">
              <Plus className="size-4" />
              新建空间
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
