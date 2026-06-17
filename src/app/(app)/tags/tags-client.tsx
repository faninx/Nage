"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
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
  createTagAction,
  updateTagAction,
  deleteTagAction,
} from "@/lib/actions/tags"
import type { ActionState } from "@/lib/actions/types"
import type { Tag } from "@/lib/db/schema"
import { Plus, Pencil, Trash2, X, Tag as TagIcon } from "lucide-react"
import { RequiredMark } from "@/components/ui/required-mark"
import { ColorPickerInput } from "@/components/ui/color-picker-input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

type TagWithCount = Tag & { itemCount: number }

type Props = {
  spaceId: number
  initial: TagWithCount[]
}

export function TagsClient({ spaceId, initial }: Props) {
  const [editing, setEditing] = useState<Tag | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [, startDelete] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return initial
    return initial.filter((t) => t.name.toLowerCase().includes(q))
  }, [initial, query])

  const [createState, createFormAction, createPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createTagAction, undefined)
  useEffect(() => {
    if (createState?.ok) {
      setCreateOpen(false)
      toast.success("已创建")
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState])

  const [editState, editFormAction, editPending] = useActionState<
    ActionState | undefined,
    FormData
  >(updateTagAction, undefined)
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false)
      setEditing(null)
      toast.success("已更新")
    } else if (editState?.error) {
      toast.error(editState.error)
    }
  }, [editState])

  function openEdit(t: Tag) {
    setEditing(t)
    setEditOpen(true)
  }

  async function handleDelete(t: TagWithCount) {
    const desc =
      t.itemCount > 0
        ? `共有 ${t.itemCount} 个物品使用此标签，删除后将解除关联。`
        : "暂无物品使用此标签。"
    if (
      !(await confirm({
        title: `删除标签「${t.name}」？`,
        description: desc,
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    setDeletingId(t.id)
    const fd = new FormData()
    fd.append("id", String(t.id))
    startDelete(async () => {
      const res = await deleteTagAction(fd)
      setDeletingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("已删除")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TagIcon className="size-5" />
          <h1 className="text-xl font-semibold">标签</h1>
          <span className="text-sm text-muted-foreground">({initial.length})</span>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              新建标签
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建标签</DialogTitle>
              <DialogDescription>标签可附加到任意物品上（多对多）</DialogDescription>
            </DialogHeader>
            <form action={createFormAction} className="space-y-3">
              <input type="hidden" name="spaceId" value={spaceId} />
              <div className="space-y-1.5">
                <Label htmlFor="t-name">名称<RequiredMark /></Label>
                <Input
                  id="t-name"
                  name="name"
                  required
                  maxLength={50}
                  autoFocus
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-color">颜色</Label>
                <ColorPickerInput id="t-color" name="color" disabled={createPending} />
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={createPending}>
                  {createPending ? "保存中…" : "新建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
          暂无标签。点击右上角「新建标签」开始。
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-xs">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标签…"
              className="pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
                className="absolute right-2 top-1/2 -translate-y-1/2 size-5 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
              没有匹配「{query}」的标签
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="group inline-flex items-center gap-1 rounded-full border bg-card pl-3 pr-1 py-1 text-sm transition-colors hover:bg-muted/40"
                  style={
                    t.color
                      ? { borderColor: t.color, backgroundColor: `${t.color}1A` }
                      : undefined
                  }
                >
                  <Link
                    href={`/items?tag=${t.id}`}
                    className="font-medium rounded-sm"
                    title="查看带此标签的物品"
                  >
                    {t.name}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(t)}
                    aria-label="编辑"
                    className="size-6 text-muted-foreground/40 hover:text-foreground hover:bg-foreground/10"
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(t)}
                    disabled={deletingId === t.id}
                    aria-label="删除"
                    className="size-6 text-muted-foreground/40 hover:text-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {query && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground">
              匹配 {filtered.length} / {initial.length} 个标签
            </p>
          )}
        </div>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setEditing(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
          </DialogHeader>
          {editing && (
            <form action={editFormAction} className="space-y-3">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-1.5">
                <Label htmlFor="e-t-name">名称<RequiredMark /></Label>
                <Input
                  id="e-t-name"
                  name="name"
                  required
                  maxLength={50}
                  defaultValue={editing.name}
                  autoFocus
                  disabled={editPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-t-color">颜色</Label>
                <ColorPickerInput
                  id="e-t-color"
                  name="color"
                  defaultValue={editing.color}
                  disabled={editPending}
                />
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={editPending}>
                  {editPending ? "保存中…" : "保存"}
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
