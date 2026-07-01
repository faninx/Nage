"use client"

import { useState } from "react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ChevronDown, KeyRound, Pencil, UserRound, Wand2 } from "lucide-react"
import { NicknameEditorDialog } from "./nickname-editor"
import { ChangePasswordDialog } from "./change-password-dialog"

type Props = {
  nickname: string
  isAdmin: boolean
}

/** 顶栏用户菜单：用户图标 + 昵称 + 角色 Badge，hover/click 展开下拉 */
export function UserMenu({ nickname, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=open]:bg-muted"
          )}
        >
          <UserRound className="size-4 text-muted-foreground" />
          <span className="font-medium">{nickname}</span>
          {isAdmin && (
            <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 group-hover:bg-blue-500/20 group-data-[state=open]:bg-blue-500/20">
              管理员
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => setNicknameOpen(true)}>
            <Pencil className="size-4" />
            修改昵称
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound className="size-4" />
            修改密码
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/mcp">
              <Wand2 className="size-4" />
              MCP 令牌
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NicknameEditorDialog
        open={nicknameOpen}
        onOpenChange={setNicknameOpen}
        initialNickname={nickname}
      />
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </>
  )
}
