"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  inviteMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
  searchUsersAction,
} from "@/lib/actions/space-members"
import {
  renameSpaceAction,
  deleteSpaceAction,
} from "@/lib/actions/spaces"
import type { ActionState } from "@/lib/actions/types"
import type { SpaceRole } from "@/lib/db/schema"
import { SPACE_ROLES } from "@/lib/db/schema"
import { Plus, UserMinus, ArrowLeft, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import Link from "next/link"
import { ROLE_LABEL, ROLE_STYLE_HOVER, ROLE_DESC } from "@/lib/space-roles"

export type MemberRow = {
  userId: number
  username: string
  nickname: string
  role: SpaceRole
  isActive: boolean
  joinedAt: string
}

type Props = {
  spaceId: number
  spaceName: string
  currentUserId: number
  initial: MemberRow[]
}

type UserHit = { id: number; username: string; nickname: string }

export function SpaceSettingsClient({ spaceId, spaceName, currentUserId, initial }: Props) {
  const router = useRouter()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [members, setMembers] = useState(initial)
  // 服务端 refresh 后 initial 变了，要把本地 state 跟上（否则别处改动看不到）
  useEffect(() => {
    setMembers(initial)
  }, [initial])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [hits, setHits] = useState<UserHit[]>([])
  const [picked, setPicked] = useState<UserHit | null>(null)
  const [pickedRole, setPickedRole] = useState<SpaceRole>("editor")
  const [, startSearch] = useTransition()

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(spaceName)
  // 同步 spaceName 到改名输入框（refresh 后 prop 会变）
  useEffect(() => {
    setRenameValue(spaceName)
  }, [spaceName])

  // 搜索用户（250ms 防抖，避免每按一键都打一次服务端）
  useEffect(() => {
    if (search.trim().length === 0) {
      setHits([])
      return
    }
    const fd = new FormData()
    fd.append("spaceId", String(spaceId))
    fd.append("q", search.trim())
    const t = setTimeout(() => {
      startSearch(async () => {
        const res = await searchUsersAction(undefined, fd)
        if (res.data) setHits(res.data)
        else setHits([])
      })
    }, 250)
    return () => clearTimeout(t)
  }, [search, spaceId])

  // invite
  const [inviteState, inviteFormAction, invitePending] = useActionState<
    ActionState | undefined,
    FormData
  >(inviteMemberAction, undefined)
  useEffect(() => {
    if (inviteState?.ok) {
      setInviteOpen(false)
      setPicked(null)
      setSearch("")
      toast.success("已添加成员")
      router.refresh()
    } else if (inviteState?.error) {
      toast.error(inviteState.error)
    }
  }, [inviteState, router])

  // rename
  const [renameState, renameFormAction, renamePending] = useActionState<
    ActionState | undefined,
    FormData
  >(renameSpaceAction, undefined)
  useEffect(() => {
    if (renameState?.ok) {
      setRenameOpen(false)
      toast.success("已改名")
      router.refresh()
    } else if (renameState?.error) {
      toast.error(renameState.error)
    }
  }, [renameState, router])

  async function handleChangeRole(m: MemberRow, newRole: SpaceRole) {
    if (newRole === m.role) return
    const fd = new FormData()
    fd.append("spaceId", String(spaceId))
    fd.append("userId", String(m.userId))
    fd.append("role", newRole)
    const res = await changeMemberRoleAction(undefined, fd)
    if (res.error) {
      toast.error(res.error)
    } else {
      setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role: newRole } : x)))
      toast.success("已更新角色")
    }
  }

  async function handleRemove(m: MemberRow) {
    if (
      !(await confirm({
        title: `确定移除「${m.nickname}」？`,
        description: "该用户将立即失去此空间的访问权限。",
        destructive: true,
        confirmText: "移除",
      }))
    )
      return
    const fd = new FormData()
    fd.append("spaceId", String(spaceId))
    fd.append("userId", String(m.userId))
    const res = await removeMemberAction(fd)
    if (res.error) {
      toast.error(res.error)
    } else {
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
      toast.success("已移除成员")
    }
  }

  async function handleDeleteSpace() {
    if (
      !(await confirm({
        title: `确定删除空间「${spaceName}」？`,
        description: "空间内的所有位置/分类/标签/物品/图片都会被永久删除，无法恢复。",
        destructive: true,
        confirmText: "删除空间",
      }))
    )
      return
    const fd = new FormData()
    fd.append("id", String(spaceId))
    const res = await deleteSpaceAction(fd)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("空间已删除")
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full pt-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" className="-ml-2">
          <Link href="/" aria-label="返回">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">空间设置</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">空间名</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 border rounded-md bg-muted/30 text-sm truncate">
              {spaceName}
            </div>
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">改名</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>改名空间</DialogTitle>
                  <DialogDescription>新名称不能与其他自己可见的空间同名</DialogDescription>
                </DialogHeader>
                <form action={renameFormAction} className="space-y-3">
                  <input type="hidden" name="id" value={spaceId} />
                  <div className="space-y-1.5">
                    <Label htmlFor="space-name">新名称</Label>
                    <Input
                      id="space-name"
                      name="name"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      required
                      minLength={1}
                      maxLength={50}
                      disabled={renamePending}
                    />
                  </div>
                  <DialogFooter showCloseButton>
                    <Button type="submit" disabled={renamePending || renameValue.trim() === spaceName}>
                      {renamePending ? "保存中…" : "保存"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">成员（{members.length}）</CardTitle>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0">
                <Plus className="size-4" />
                添加成员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加成员</DialogTitle>
                <DialogDescription>按用户名搜索（仅匹配前缀），已激活的成员</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="search">搜索用户名</Label>
                  <Input
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="输入至少 1 个字符"
                    autoFocus
                  />
                </div>
                {hits.length > 0 && (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 hover:bg-muted/40 ${
                          picked?.id === h.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setPicked(h)}
                      >
                        <div className="text-sm font-mono">{h.username}</div>
                        <div className="text-xs text-muted-foreground">{h.nickname}</div>
                      </button>
                    ))}
                  </div>
                )}
                {picked && (
                  <form action={inviteFormAction} className="space-y-3 border-t pt-3">
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <input type="hidden" name="username" value={picked.username} />
                    <div className="text-sm">
                      选中：<span className="font-mono">{picked.username}</span>
                      <span className="text-muted-foreground">（{picked.nickname}）</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-role">角色</Label>
                      <Select
                        name="role"
                        value={pickedRole}
                        onValueChange={(v) => setPickedRole(v as SpaceRole)}
                      >
                        <SelectTrigger className="w-full" id="invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SPACE_ROLES.filter((r) => r !== "owner").map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]} · {ROLE_DESC[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter showCloseButton>
                      <Button type="submit" disabled={invitePending}>
                        {invitePending ? "添加中…" : "添加"}
                      </Button>
                    </DialogFooter>
                  </form>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-6 pt-0 space-y-3">
          <Table className="border-t [&_tbody_tr:last-child]:border-b">
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="text-sm font-mono">{m.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.nickname}
                      {m.userId === currentUserId && <span className="ml-1.5">(你)</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleChangeRole(m, v as SpaceRole)}
                      disabled={m.userId === currentUserId}
                    >
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPACE_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            <Badge className={ROLE_STYLE_HOVER[r]}>{ROLE_LABEL[r]}</Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {m.isActive ? (
                      <span className="text-green-600 dark:text-green-400 text-xs">启用</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">已停用</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(m)}
                      disabled={m.userId === currentUserId}
                      aria-label="移除成员"
                      title="移除成员"
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            所有者=全部权限并可管理成员；编辑=增删改物品/位置/分类/标签；查看=只读。
            如果你是当前唯一所有者，请先把「所有者」角色转给其他成员，再改/移出自己。
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">危险操作</CardTitle>
          <p className="text-xs text-muted-foreground">
            删除空间不可恢复，会清空空间内的所有位置、分类、标签、物品和图片。
          </p>
        </CardHeader>
        <CardContent>
          {/* 没有外层 Dialog——直接点按钮调 handleDeleteSpace，里面 useConfirm() 弹一次。
              之前套 Dialog 是冗余（双层弹窗），跟 handleRemove 移除成员模式保持一致。 */}
          <Button variant="destructive" size="sm" onClick={handleDeleteSpace}>
            <Trash2 className="size-4" />
            删除此空间
          </Button>
        </CardContent>
      </Card>

      {confirmDialog}
    </div>
  )
}
