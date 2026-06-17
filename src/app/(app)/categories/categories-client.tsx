"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
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
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/lib/actions/categories"
import type { ActionState } from "@/lib/actions/types"
import type { Category } from "@/lib/db/schema"
import { Plus, Pencil, Trash2, FolderTree } from "lucide-react"
import { RequiredMark } from "@/components/ui/required-mark"
import { EmojiPickerInput } from "@/components/ui/emoji-picker-input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

type CategoryWithCount = Category & { itemCount: number }

type Props = {
  spaceId: number
  initial: CategoryWithCount[]
}

export function CategoriesClient({ spaceId, initial }: Props) {
  const [editing, setEditing] = useState<Category | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [, startDelete] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  // create
  const [createState, createFormAction, createPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createCategoryAction, undefined)
  useEffect(() => {
    if (createState?.ok) {
      setCreateOpen(false)
      toast.success("已创建")
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState])

  // edit
  const [editState, editFormAction, editPending] = useActionState<
    ActionState | undefined,
    FormData
  >(updateCategoryAction, undefined)
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false)
      setEditing(null)
      toast.success("已更新")
    } else if (editState?.error) {
      toast.error(editState.error)
    }
  }, [editState])

  function openEdit(c: Category) {
    setEditing(c)
    setEditOpen(true)
  }

  async function handleDelete(c: CategoryWithCount) {
    const desc =
      c.itemCount > 0
        ? `该分类下共有 ${c.itemCount} 个物品，删除后将变为未分类。`
        : "该分类下暂无物品。"
    if (
      !(await confirm({
        title: `删除分类「${c.name}」？`,
        description: desc,
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    setDeletingId(c.id)
    const fd = new FormData()
    fd.append("id", String(c.id))
    startDelete(async () => {
      const res = await deleteCategoryAction(fd)
      setDeletingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("已删除")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="size-5" />
          <h1 className="text-xl font-semibold">分类</h1>
          <span className="text-sm text-muted-foreground">({initial.length})</span>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              新建分类
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建分类</DialogTitle>
              <DialogDescription>分类用于归类物品</DialogDescription>
            </DialogHeader>
            <form action={createFormAction} className="space-y-3">
              <input type="hidden" name="spaceId" value={spaceId} />
              <div className="space-y-1.5">
                <Label htmlFor="c-name">名称<RequiredMark /></Label>
                <Input
                  id="c-name"
                  name="name"
                  required
                  maxLength={50}
                  autoFocus
                  disabled={createPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label>图标</Label>
                <EmojiPickerInput name="icon" disabled={createPending} />
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
          暂无分类。点击右上角「新建分类」开始。
        </p>
      ) : (
        <ul className="divide-y border rounded-lg bg-card">
          {initial.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              {c.icon && <span className="text-lg w-6 text-center">{c.icon}</span>}
              <Link
                href={`/items?cat=${c.id}`}
                className="font-medium text-sm flex-1 truncate rounded-sm"
                title="查看此分类下的物品"
              >
                {c.name}
              </Link>
              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(c)}
                  aria-label="编辑"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  aria-label="删除"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
            <DialogTitle>编辑分类</DialogTitle>
          </DialogHeader>
          {editing && (
            <form action={editFormAction} className="space-y-3">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-1.5">
                <Label htmlFor="e-c-name">名称<RequiredMark /></Label>
                <Input
                  id="e-c-name"
                  name="name"
                  required
                  maxLength={50}
                  defaultValue={editing.name}
                  autoFocus
                  disabled={editPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label>图标</Label>
                <EmojiPickerInput
                  name="icon"
                  defaultValue={editing.icon}
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
