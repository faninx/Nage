"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createLocationAction,
  renameLocationAction,
  deleteLocationAction,
  moveLocationAction,
  reorderLocationAction,
} from "@/lib/actions/locations"
import type { ActionState } from "@/lib/actions/types"
import type { Location } from "@/lib/db/schema"
import {
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Move,
  QrCode,
  Folder,
  MapPin,
} from "lucide-react"
import { RequiredMark } from "@/components/ui/required-mark"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type LocationWithCount = Location & { itemCount: number }

type Props = {
  spaceId: number
  initial: LocationWithCount[]
}

type Node = LocationWithCount & { children: Node[]; depth: number }

function buildTree(list: LocationWithCount[]): Node[] {
  const map = new Map<number, Node>()
  for (const l of list) map.set(l.id, { ...l, children: [], depth: 0 })
  const roots: Node[] = []
  for (const l of list) {
    const node = map.get(l.id)!
    if (l.parentId && map.has(l.parentId)) {
      const parent = map.get(l.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function flatten(nodes: Node[]): Node[] {
  const out: Node[] = []
  function walk(n: Node) {
    out.push(n)
    n.children.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    for (const c of n.children) walk(c)
  }
  for (const r of nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) walk(r)
  return out
}

/** 算 path（用于"上移"对话框显示），返回从根到自身的 id 列表。 */
function getPath(list: Location[], id: number): Location[] {
  const map = new Map(list.map((l) => [l.id, l]))
  const path: Location[] = []
  let cur = map.get(id)
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return path
}

/** 是否为 ancestor 的后代（含直接子级） */
function isDescendantOf(list: Location[], ancestorId: number, candidateId: number): boolean {
  if (ancestorId === candidateId) return false
  const childrenOf = (pid: number) => list.filter((l) => l.parentId === pid).map((l) => l.id)
  const stack = [...childrenOf(ancestorId)]
  while (stack.length) {
    const id = stack.pop()!
    if (id === candidateId) return true
    stack.push(...childrenOf(id))
  }
  return false
}

/** 算以 id 为根的子树最大深度（自身算 1） */
function subtreeMaxDepth(list: Location[], id: number): number {
  let max = 1
  let level = [id]
  while (level.length) {
    const next: number[] = []
    for (const pid of level) {
      for (const c of list) {
        if (c.parentId === pid) next.push(c.id)
      }
    }
    if (next.length === 0) break
    max++
    level = next
  }
  return max
}

/** 算节点深度（root=1） */
function getDepthOf(list: Location[], id: number): number {
  const map = new Map(list.map((l) => [l.id, l]))
  let depth = 0
  let cur = map.get(id)
  let guard = 0
  while (cur && guard++ < 10) {
    depth++
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return depth
}

export function LocationsClient({ spaceId, initial }: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [createParentId, setCreateParentId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Location | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [moving, setMoving] = useState<Location | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<string>("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [qrLocationId, setQrLocationId] = useState<number | null>(null)
  const [, startDelete] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const tree = useMemo(() => buildTree(initial), [initial])
  const flat = useMemo(() => flatten(tree), [tree])
  const pathMap = useMemo(() => {
    const m = new Map<number, Location[]>()
    for (const l of initial) m.set(l.id, getPath(initial, l.id))
    return m
  }, [initial])

  // create
  const [createState, createFormAction, createPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createLocationAction, undefined)
  useEffect(() => {
    if (createState?.ok) {
      setCreateOpen(false)
      setCreateParentId(null)
      toast.success("已创建")
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState])

  // edit
  const [editState, editFormAction, editPending] = useActionState<
    ActionState | undefined,
    FormData
  >(renameLocationAction, undefined)
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false)
      setEditing(null)
      toast.success("已更新")
    } else if (editState?.error) {
      toast.error(editState.error)
    }
  }, [editState])

  // move
  const [moveState, moveFormAction, movePending] = useActionState<
    ActionState | undefined,
    FormData
  >(moveLocationAction, undefined)
  useEffect(() => {
    if (moveState?.ok) {
      setMoveOpen(false)
      setMoving(null)
      setMoveTarget("")
      toast.success("已移动")
    } else if (moveState?.error) {
      toast.error(moveState.error)
    }
  }, [moveState])

  // 拖拽状态
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: number
    pos: "before" | "after" | "child"
  } | null>(null)
  const [dropIntoRoot, setDropIntoRoot] = useState(false)
  const [, startReorder] = useTransition()

  function onDragStart(e: React.DragEvent<HTMLLIElement>, id: number) {
    setDraggingId(id)
    setDropTarget(null)
    setDropIntoRoot(false)
    e.dataTransfer.effectAllowed = "move"
    // 必填：dataTransfer.setData 才能让 Firefox/Edge 触发 drop
    e.dataTransfer.setData("text/plain", String(id))
  }

  function onDragEnd() {
    setDraggingId(null)
    setDropTarget(null)
    setDropIntoRoot(false)
  }

  function onRowDragOver(
    e: React.DragEvent<HTMLLIElement>,
    node: Node
  ) {
    if (draggingId == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const h = rect.height
    let pos: "before" | "after" | "child"
    if (y < h / 3) pos = "before"
    else if (y > (h * 2) / 3) pos = "after"
    else pos = "child"
    setDropTarget({ id: node.id, pos })
  }

  function onRowDragLeave(e: React.DragEvent<HTMLLIElement>) {
    // 仅当真正离开 li 时清掉（relatedTarget 不在 li 内）
    const next = e.relatedTarget as globalThis.Node | null
    if (next && e.currentTarget.contains(next)) return
    setDropTarget(null)
  }

  function onRootZoneDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (draggingId == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropIntoRoot(true)
    setDropTarget(null)
  }
  function onRootZoneDragLeave(e: React.DragEvent<HTMLDivElement>) {
    const next = e.relatedTarget as globalThis.Node | null
    if (next && e.currentTarget.contains(next)) return
    setDropIntoRoot(false)
  }

  function onRowDrop(
    e: React.DragEvent<HTMLLIElement>
  ) {
    if (draggingId == null) return
    e.preventDefault()
    performDrop()
  }
  function onRootZoneDrop(e: React.DragEvent<HTMLDivElement>) {
    if (draggingId == null) return
    e.preventDefault()
    performDrop()
  }

  function performDrop() {
    if (draggingId == null) return
    const dragged = initial.find((l) => l.id === draggingId)
    if (!dragged) return

    let newParentId: number | null
    let beforeId: number | null
    if (dropTarget && dropTarget.pos === "child") {
      // 放到某节点下，作为其最后一个子节点
      newParentId = dropTarget.id
      beforeId = null
    } else if (dropTarget) {
      // 放到某节点前/后，与该节点同一父级
      const target = initial.find((l) => l.id === dropTarget.id)
      if (!target) return
      newParentId = target.parentId ?? null
      if (dropTarget.pos === "before") {
        beforeId = target.id
      } else {
        // after = 放在 target 后一位的前面（即 target 之后的下一个 sibling）
        const flatIds = flat.map((n) => n.id)
        const idx = flatIds.indexOf(target.id)
        const nextRow = flat[idx + 1]
        const nextParent = nextRow ? initial.find((l) => l.id === nextRow.id)?.parentId ?? null : null
        beforeId =
          nextRow && nextParent === newParentId ? nextRow.id : null
      }
    } else if (dropIntoRoot) {
      newParentId = null
      beforeId = null
    } else {
      return
    }

    // 校验：不能是自己；不能是自己的后代；层级不超 5
    if (newParentId === draggingId) {
      toast.error("不能移到自身")
      return
    }
    if (newParentId && isDescendantOf(initial, draggingId, newParentId)) {
      toast.error("不能移到自己的子位置")
      return
    }
    if (beforeId === draggingId) {
      toast.error("排序参考无效")
      return
    }
    const newParentDepth = newParentId
      ? (initial.find((l) => l.id === newParentId) ? getDepthOf(initial, newParentId) : 0)
      : 0
    const draggedDepth = getDepthOf(initial, draggingId)
    const subDepth = subtreeMaxDepth(initial, draggingId)
    // 移到 newParent 下后，dragged 的深度变为 newParentDepth + 1，其子树整体平移
    const depthDelta = (newParentDepth + 1) - draggedDepth
    const finalMaxDepth = draggedDepth + depthDelta + (subDepth - 1)
    if (finalMaxDepth > 5) {
      toast.error(`移动后层级将超过 5 级`)
      return
    }

    const fd = new FormData()
    fd.append("id", String(draggingId))
    fd.append("newParentId", newParentId == null ? "" : String(newParentId))
    fd.append("beforeId", beforeId == null ? "" : String(beforeId))
    startReorder(async () => {
      const res = await reorderLocationAction(undefined, fd)
      if (res.error) toast.error(res.error)
      else {
        toast.success("已调整顺序")
        router.refresh()
      }
    })
  }

  function openCreate(parentId: number | null) {
    setCreateParentId(parentId)
    setCreateOpen(true)
  }
  function openEdit(l: Location) {
    setEditing(l)
    setEditOpen(true)
  }
  function openMove(l: Location) {
    setMoving(l)
    setMoveTarget("") // 根
    setMoveOpen(true)
  }
  async function handleDelete(node: Node) {
    // 统计子位置数量 + 自身及所有后代下的物品总数
    let descItemCount = node.itemCount
    let descChildCount = 0
    const stack = [...node.children]
    while (stack.length) {
      const c = stack.pop()!
      descChildCount++
      descItemCount += c.itemCount
      stack.push(...c.children)
    }
    const parts: string[] = []
    if (descChildCount > 0) parts.push(`含 ${descChildCount} 个子位置`)
    if (descItemCount > 0) parts.push(`共 ${descItemCount} 个物品`)
    const desc =
      parts.length > 0
        ? parts.join("，") + "，将一并级联删除。"
        : "此位置下无任何子位置或物品。"
    if (
      !(await confirm({
        title: `删除位置「${node.name}」？`,
        description: desc,
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    setDeletingId(node.id)
    const fd = new FormData()
    fd.append("id", String(node.id))
    startDelete(async () => {
      const res = await deleteLocationAction(fd)
      setDeletingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("已删除")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="size-5" />
          <h1 className="text-xl font-semibold">位置</h1>
        </div>
        <Button size="sm" onClick={() => openCreate(null)}>
          <Plus className="size-4" />
          新建根位置
        </Button>
      </div>

      {flat.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
          暂无位置。点击右上角「新建根位置」开始。
        </p>
      ) : (
        <>
          {/* 根级落点区：拖到列表最上方空白处 → 移到根级末尾 */}
          <div
            onDragOver={onRootZoneDragOver}
            onDragLeave={onRootZoneDragLeave}
            onDrop={onRootZoneDrop}
            className={cn(
              "h-2 rounded-lg border border-dashed transition-colors",
              dropIntoRoot
                ? "border-primary bg-primary/10"
                : "border-transparent"
            )}
            aria-label="拖到此处作为根位置"
            title="拖到此处作为根位置"
          />
          <ul className="border rounded-lg bg-card divide-y">
            {flat.map((node) => {
              const isDragging = draggingId === node.id
              const drop = dropTarget && dropTarget.id === node.id ? dropTarget : null
              return (
                <li
                  key={node.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onRowDragOver(e, node)}
                  onDragLeave={onRowDragLeave}
                  onDrop={onRowDrop}
                  className={cn(
                    "group relative flex items-center gap-1 px-2 py-1.5 transition-colors hover:bg-muted/40",
                    isDragging && "opacity-40"
                  )}
                  style={{ paddingLeft: 8 + node.depth * 20 }}
                >
                  {/* 拖动指示：上方 */}
                  {drop?.pos === "before" && (
                    <span
                      className="absolute left-0 right-0 -top-px h-0.5 bg-primary rounded-full pointer-events-none"
                      aria-hidden
                    />
                  )}
                  {/* 拖动指示：下方 */}
                  {drop?.pos === "after" && (
                    <span
                      className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full pointer-events-none"
                      aria-hidden
                    />
                  )}
                  {/* 拖动指示：作为子节点（背景高亮） */}
                  {drop?.pos === "child" && (
                    <span
                      className="absolute inset-0 bg-primary/10 ring-1 ring-primary/40 rounded-sm pointer-events-none"
                      aria-hidden
                    />
                  )}
                  <GripVertical
                    className="size-3.5 text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0"
                    aria-hidden
                  />
                  {node.depth > 0 && (
                    <ChevronRight className="size-3.5 text-muted-foreground/50" />
                  )}
                  <Link
                    href={`/items?loc=${node.id}`}
                    className="flex-1 min-w-0 rounded-sm py-1 px-1.5 -my-1 -mx-1.5"
                    title="查看此位置（含子位置）的物品"
                  >
                    <div className="text-sm font-medium truncate">{node.name}</div>
                    {node.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {node.description}
                      </div>
                    )}
                  </Link>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openCreate(node.id)}
                      aria-label="新增子位置"
                      title="新增子位置"
                      disabled={node.depth >= 4} // 子位置到第 5 级后不能再加
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openMove(node)}
                      aria-label="移动"
                      title="移动"
                    >
                      <Move className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setQrLocationId(node.id)}
                      aria-label="二维码"
                      title="二维码"
                    >
                      <QrCode className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(node)}
                      aria-label="重命名"
                      title="重命名"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(node)}
                      disabled={deletingId === node.id}
                      aria-label="删除"
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* 新建对话框 */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) setCreateParentId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建位置</DialogTitle>
            <DialogDescription>
              {createParentId
                ? `作为「${
                    pathMap.get(createParentId)?.map((l) => l.name).join(" / ")
                  }」的子位置`
                : "作为根位置（顶级）"}
            </DialogDescription>
          </DialogHeader>
          <form action={createFormAction} className="space-y-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            {createParentId !== null && (
              <input type="hidden" name="parentId" value={createParentId} />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">名称<RequiredMark /></Label>
              <Input
                id="loc-name"
                name="name"
                required
                maxLength={50}
                autoFocus
                disabled={createPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-desc">描述</Label>
              <Input
                id="loc-desc"
                name="description"
                maxLength={500}
                disabled={createPending}
              />
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" disabled={createPending}>
                {createPending ? "保存中…" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setEditing(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          {editing && (
            <form action={editFormAction} className="space-y-3">
              <input type="hidden" name="id" value={editing.id} />
              <div className="space-y-1.5">
                <Label htmlFor="rn-name">新名称<RequiredMark /></Label>
                <Input
                  id="rn-name"
                  name="name"
                  required
                  maxLength={50}
                  defaultValue={editing.name}
                  autoFocus
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

      {/* 移动对话框 */}
      <Dialog
        open={moveOpen}
        onOpenChange={(o) => {
          setMoveOpen(o)
          if (!o) {
            setMoving(null)
            setMoveTarget("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移动位置</DialogTitle>
            <DialogDescription>
              {moving && `将「${moving.name}」移到：`}
            </DialogDescription>
          </DialogHeader>
          {moving && (
            <form action={moveFormAction} className="space-y-3">
              <input type="hidden" name="id" value={moving.id} />
              <div className="space-y-1.5">
                <Label htmlFor="mv-target">新父位置</Label>
                <Select value={moveTarget} onValueChange={setMoveTarget}>
                  <SelectTrigger className="w-full" id="mv-target">
                    <SelectValue placeholder="（根位置）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">（根位置）</SelectItem>
                    {initial
                      .filter((l) => l.id !== moving.id)
                      .map((l) => {
                        const path = pathMap.get(l.id) ?? []
                        return (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {path.map((p) => p.name).join(" / ")}
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="newParentId"
                  value={moveTarget === "__root__" || moveTarget === "" ? "" : moveTarget}
                />
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={movePending}>
                  {movePending ? "移动中…" : "移动"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 二维码对话框 */}
      <Dialog
        open={qrLocationId != null}
        onOpenChange={(o) => {
          if (!o) setQrLocationId(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>位置二维码</DialogTitle>
            <DialogDescription>
              扫码查看「
              {qrLocationId ? pathMap.get(qrLocationId)?.map((p) => p.name).join(" / ") : ""}
              」下的物品
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrLocationId != null ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/qr/location/${qrLocationId}`}
                alt="位置二维码"
                className="size-64 border rounded bg-white p-2"
              />
            ) : (
              <div className="size-64 border rounded bg-muted flex items-center justify-center">
                <Folder className="size-12 text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              扫码后直接跳转到此位置的物品列表
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}
