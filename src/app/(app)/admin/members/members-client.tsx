"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  createMemberAction,
  toggleMemberActiveAction,
  resetPasswordAction,
} from "@/lib/actions/members"
import type { ActionState } from "@/lib/actions/types"
import type { User } from "@/lib/db/schema"
import { Plus, Power, KeyRound, Users } from "lucide-react"
import { RequiredMark } from "@/components/ui/required-mark"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

type Props = {
  currentUserId: number
  initial: User[]
}

function formatDate(d: Date | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MembersClient({ currentUserId, initial }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [resetting, setResetting] = useState<User | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [, startToggle] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [createState, createFormAction, createPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createMemberAction, undefined)
  useEffect(() => {
    if (createState?.ok) {
      setCreateOpen(false)
      toast.success("已创建成员")
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState])

  const [resetState, resetFormAction, resetPending] = useActionState<
    ActionState | undefined,
    FormData
  >(resetPasswordAction, undefined)
  useEffect(() => {
    if (resetState?.ok) {
      setResetOpen(false)
      setResetting(null)
      toast.success("密码已重置")
    } else if (resetState?.error) {
      toast.error(resetState.error)
    }
  }, [resetState])

  async function handleToggle(u: User) {
    const msg = u.isActive ? "停用" : "启用"
    if (
      !(await confirm({
        title: `确定${msg}用户「${u.nickname}」？`,
        destructive: u.isActive,
        confirmText: msg,
      }))
    )
      return
    setTogglingId(u.id)
    const fd = new FormData()
    fd.append("id", String(u.id))
    startToggle(async () => {
      const res = await toggleMemberActiveAction(fd)
      setTogglingId(null)
      if (res.error) toast.error(res.error)
      else toast.success(`${msg}成功`)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-5" />
          <h1 className="text-xl font-semibold">成员管理</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              新增成员
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增成员</DialogTitle>
              <DialogDescription>为家庭/团队添加新账号</DialogDescription>
            </DialogHeader>
            <form action={createFormAction} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-username">用户名<RequiredMark /></Label>
                <Input
                  id="m-username"
                  name="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_-]+"
                  autoFocus
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-nickname">昵称<RequiredMark /></Label>
                <Input
                  id="m-nickname"
                  name="nickname"
                  required
                  minLength={1}
                  maxLength={50}
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-password">初始密码<RequiredMark /></Label>
                <Input
                  id="m-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  maxLength={128}
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-role">角色<RequiredMark /></Label>
                <Select name="role" defaultValue="member">
                  <SelectTrigger className="w-full" id="m-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">普通成员</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={createPending}>
                  {createPending ? "保存中…" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.username}</TableCell>
                <TableCell>
                  {u.nickname}
                  {u.id === currentUserId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (你)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20">
                      管理员
                    </Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted/80">
                      成员
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.isActive ? (
                    <span className="text-green-600 dark:text-green-400 text-xs">
                      启用
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">已停用</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(u.lastLoginAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setResetting(u)
                        setResetOpen(true)
                      }}
                      aria-label="重置密码"
                      title="重置密码"
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleToggle(u)}
                      disabled={togglingId === u.id || u.id === currentUserId}
                      aria-label={u.isActive ? "停用" : "启用"}
                      title={u.isActive ? "停用" : "启用"}
                    >
                      <Power className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 重置密码对话框 */}
      <Dialog
        open={resetOpen}
        onOpenChange={(o) => {
          setResetOpen(o)
          if (!o) setResetting(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              {resetting && `为「${resetting.nickname}」设置新密码`}
            </DialogDescription>
          </DialogHeader>
          {resetting && (
            <form action={resetFormAction} className="space-y-3">
              <input type="hidden" name="userId" value={resetting.id} />
              <div className="space-y-1.5">
                <Label htmlFor="r-pw">新密码<RequiredMark /></Label>
                <Input
                  id="r-pw"
                  name="newPassword"
                  type="password"
                  required
                  minLength={6}
                  maxLength={128}
                  autoFocus
                  disabled={resetPending}
                />
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={resetPending}>
                  {resetPending ? "保存中…" : "重置"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}
