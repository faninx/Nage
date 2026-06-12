"use client"

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { type LocNode } from "@/components/location-tree-select"
import { LocationTreeMultiSelect } from "@/components/location-tree-multi-select"
import { TagsMultiSelect, type TagOpt } from "@/components/tags-multi-select"
import {
  createItemAction,
  updateItemAction,
  deleteItemAction,
  deleteItemsAction,
  searchItemsAction,
} from "@/lib/actions/items"
import { type ActionState } from "@/lib/actions/types"
import { formatPrice } from "@/lib/format"
import { expiryBucket, expiryClass, expiryLabel } from "@/lib/expiry"
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  ItemForm,
  ITEM_FORM_UNSET,
  type CategoryOpt,
  type ItemFormItem,
  type ItemFormImage,
} from "./item-form"

// Re-exports of the canonical shapes used by the edit form.
export type ItemRow = ItemFormItem & {
  categoryName: string | null
  locationName: string | null
  expiredAt: string | null
  daysUntilExpired: number | null
  updatedAt: string
}
export type ItemImage = ItemFormImage

export type ItemTag = {
  id: number
  name: string
  color: string | null
}

export type ItemFilters = {
  q: string
  cat: number | null
  loc: number[] | null
  tag: number[] | null
  sort: "updated" | "name" | "created"
  page: number
  exp: "expired" | "7d" | "30d" | "all"
}

type SearchResult = {
  items: ItemRow[]
  total: number
  totalPages: number
  page: number
  firstImages: Record<number, string>
  imagesByItem: Record<number, ItemImage[]>
  tagsByItem: Record<number, ItemTag[]>
}

type Props = {
  spaceId: number
  initialFilters: ItemFilters
  initial: SearchResult
  categories: CategoryOpt[]
  locations: LocNode[]
  tags: TagOpt[]
  pageSize: number
}

const UNSET = ITEM_FORM_UNSET
const VIEW_KEY = "nage-items-view"
type View = "list" | "card"

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === "card" ? "card" : "list"
  } catch {
    return "list"
  }
}

/** 过期状态 badge：按 daysUntilExpired 算颜色 + 文案 */
function ExpiryBadge({ days, expiredAt }: { days: number | null; expiredAt: string | null }) {
  if (days == null || !expiredAt) return null
  return (
    <span className={cn("text-xs whitespace-nowrap", expiryClass(expiryBucket(days)))}>
      📅 {expiryLabel(days, expiredAt)}
    </span>
  )
}

function buildHref(f: ItemFilters): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set("q", f.q)
  if (f.cat) sp.set("cat", String(f.cat))
  if (f.loc && f.loc.length > 0) {
    for (const id of f.loc) sp.append("loc", String(id))
  }
  if (f.tag && f.tag.length > 0) {
    for (const id of f.tag) sp.append("tag", String(id))
  }
  if (f.sort !== "updated") sp.set("sort", f.sort)
  if (f.exp !== "all") sp.set("exp", f.exp)
  if (f.page > 1) sp.set("page", String(f.page))
  const qs = sp.toString()
  return qs ? `/items?${qs}` : "/items"
}

// ============================================================
// FilterBar
// ============================================================
function FilterBar({
  filters,
  categories,
  locations,
  tags,
  total,
  pending,
  spaceId,
  onFiltersChange,
}: {
  filters: ItemFilters
  categories: CategoryOpt[]
  locations: LocNode[]
  tags: TagOpt[]
  total: number
  pending: boolean
  spaceId: number
  onFiltersChange: (next: Partial<ItemFilters>) => void
}) {
  const [q, setQ] = useState(filters.q)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setQ(filters.q)
  }, [filters.q])

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed === filters.q) return
    const t = setTimeout(() => {
      onFiltersChange({ q: trimmed, page: 1 })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Escape") return
    if (q === "") return
    e.preventDefault()
    e.stopPropagation()
    setQ("")
    onFiltersChange({ q: "", page: 1 })
    setTimeout(() => {
      searchRef.current?.focus()
    }, 0)
  }

  function pushNonQ(overrides: Partial<ItemFilters>) {
    onFiltersChange({ ...overrides, page: 1 })
  }

  const hasFilter =
    !!filters.q ||
    filters.cat != null ||
    (filters.loc != null && filters.loc.length > 0) ||
    (filters.tag != null && filters.tag.length > 0) ||
    filters.sort !== "updated" ||
    filters.exp !== "all" ||
    filters.page > 1

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="搜索名称或描述…"
            className="pl-7 pr-9 h-8 text-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("")
                onFiltersChange({ q: "", page: 1 })
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-5 rounded-sm text-muted-foreground hover:text-foreground flex items-center justify-center"
              aria-label="清空输入"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={filters.cat != null ? String(filters.cat) : UNSET}
          onValueChange={(v) => pushNonQ({ cat: v === UNSET ? null : Number(v) })}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>全部分类</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-44">
          <LocationTreeMultiSelect
            locations={locations}
            value={filters.loc ?? []}
            onChange={(v) => pushNonQ({ loc: v })}
            disabled={pending}
          />
        </div>
        <div className="w-44">
          <TagsMultiSelect
            tags={tags}
            value={filters.tag ?? []}
            onChange={(v) => pushNonQ({ tag: v })}
            disabled={pending}
            spaceId={spaceId}
          />
        </div>
        <Select
          value={filters.sort}
          onValueChange={(v) => pushNonQ({ sort: v as ItemFilters["sort"] })}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">最近更新</SelectItem>
            <SelectItem value="created">创建时间</SelectItem>
            <SelectItem value="name">名称 A→Z</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.exp}
          onValueChange={(v) => pushNonQ({ exp: v as ItemFilters["exp"] })}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="expired">已过期</SelectItem>
            <SelectItem value="7d">7 天内过期</SelectItem>
            <SelectItem value="30d">30 天内过期</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("")
            onFiltersChange({
              q: "",
              cat: null,
              loc: null,
              tag: null,
              sort: "updated",
              exp: "all",
              page: 1,
            })
          }}
          disabled={!hasFilter || pending}
          className={hasFilter ? "" : "invisible"}
          aria-hidden={!hasFilter}
          tabIndex={hasFilter ? 0 : -1}
        >
          <X className="size-3.5" />
          清除
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        共 {total} 条 {pending && "（加载中…）"}
      </p>
    </div>
  )
}

// ============================================================
// Pagination
// ============================================================
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pending,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  pending: boolean
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {start}-{end} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1 || pending}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages || pending}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// BatchBar
// ============================================================
function BatchBar({
  count,
  pending,
  onClear,
  onDelete,
}: {
  count: number
  pending: boolean
  onClear: () => void
  onDelete: () => void
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-accent/30 text-sm">
      <span>已选 {count} 项</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          取消
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={pending}
        >
          <Trash2 className="size-4" />
          删除所选
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Checkbox（无 UI 库，用 div + button 凑）
// ============================================================
function Checkbox({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onChange(!checked)
      }}
      className={cn(
        "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
        checked ? "bg-primary border-primary text-primary-foreground" : "bg-background",
        disabled && "opacity-50"
      )}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="size-3 fill-current">
          <path d="M13.5 4.5L6 12L2.5 8.5L3.91 7.09L6 9.17L12.09 3.09L13.5 4.5Z" />
        </svg>
      )}
    </button>
  )
}

// ============================================================
// ItemRowList
// ============================================================
function ItemRowList({
  items,
  firstImages,
  tagsByItem,
  selected,
  deletingId,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  items: ItemRow[]
  firstImages: Record<number, string>
  tagsByItem: Record<number, ItemTag[]>
  selected: Set<number>
  deletingId: number | null
  onToggleSelect: (id: number) => void
  onEdit: (it: ItemRow) => void
  onDelete: (it: ItemRow) => void
}) {
  return (
    <ul className="divide-y border rounded-lg bg-card">
      {items.map((it) => {
        const cover = firstImages[it.id]
        const tgs = tagsByItem[it.id] ?? []
        const priceText = formatPrice(it.price, "💴")
        return (
          <li
            key={it.id}
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 group"
          >
            <Checkbox
              checked={selected.has(it.id)}
              onChange={() => onToggleSelect(it.id)}
              ariaLabel={`选择 ${it.name}`}
            />
            <Link
              href={`/items/${it.id}`}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="relative size-12 shrink-0 rounded-md overflow-hidden bg-muted border">
                {cover ? (
                  <Image
                    src={cover}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-muted-foreground">
                    <Package className="size-5" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {it.name}
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                    ×{it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                  {it.locationName && <span className="min-w-0 break-words">📍 {it.locationName}</span>}
                  {it.categoryName && <span>🏷 {it.categoryName}</span>}
                  {priceText && <span className="shrink-0">{priceText}</span>}
                  {it.expiredAt && (
                    <ExpiryBadge days={it.daysUntilExpired} expiredAt={it.expiredAt} />
                  )}
                </div>
                {tgs.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {tgs.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px]"
                        style={t.color ? { borderColor: t.color, color: t.color } : undefined}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(it)}
                aria-label="编辑"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(it)}
                disabled={deletingId === it.id}
                aria-label="删除"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// ItemCardGrid
// ============================================================
function ItemCardGrid({
  items,
  firstImages,
  tagsByItem,
  selected,
  deletingId,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  items: ItemRow[]
  firstImages: Record<number, string>
  tagsByItem: Record<number, ItemTag[]>
  selected: Set<number>
  deletingId: number | null
  onToggleSelect: (id: number) => void
  onEdit: (it: ItemRow) => void
  onDelete: (it: ItemRow) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((it) => {
        const cover = firstImages[it.id]
        const tgs = tagsByItem[it.id] ?? []
        const priceText = formatPrice(it.price, "💴")
        return (
          <div
            key={it.id}
            className="relative rounded-lg border bg-card overflow-hidden group"
          >
            <div className="absolute top-2 left-2 z-10">
              <Checkbox
                checked={selected.has(it.id)}
                onChange={() => onToggleSelect(it.id)}
                ariaLabel={`选择 ${it.name}`}
              />
            </div>
            <Link href={`/items/${it.id}`} className="block">
              <div className="relative aspect-square bg-muted">
                {cover ? (
                  <Image
                    src={cover}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 200px, 33vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-muted-foreground">
                    <Package className="size-10" />
                  </div>
                )}
              </div>
              <div className="p-2 space-y-1">
                <div className="text-sm font-medium truncate">
                  {it.name}
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                    ×{it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  {it.locationName && <span className="min-w-0 break-words">📍 {it.locationName}</span>}
                  {it.categoryName && <span>🏷 {it.categoryName}</span>}
                  {priceText && <span className="shrink-0">{priceText}</span>}
                  {it.expiredAt && (
                    <ExpiryBadge days={it.daysUntilExpired} expiredAt={it.expiredAt} />
                  )}
                </div>
                {tgs.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {tgs.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px]"
                        style={t.color ? { borderColor: t.color, color: t.color } : undefined}
                      >
                        {t.name}
                      </span>
                    ))}
                    {tgs.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{tgs.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
            <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => onEdit(it)}
                aria-label="编辑"
                className="size-7"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => onDelete(it)}
                disabled={deletingId === it.id}
                aria-label="删除"
                className="size-7"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// ItemsClient
// ============================================================
export function ItemsClient({
  spaceId,
  initialFilters,
  initial,
  categories,
  locations,
  tags,
  pageSize,
}: Props) {
  const [filters, setFilters] = useState<ItemFilters>(initialFilters)
  const [data, setData] = useState<SearchResult>(initial)
  const [searchPending, startSearchTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [editingTagIds, setEditingTagIds] = useState<number[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [, startDelete] = useTransition()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchPending, setBatchPending] = useState(false)
  // lazy initializer：首屏就拿到 localStorage 偏好，避免「读 + 写 + hydrated」三态
  const [view, setView] = useState<View>(readView)
  const { confirm, dialog: confirmDialog } = useConfirm()

  function changeView(next: View) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {}
  }

  // 数据变化时清掉已不在当前页的勾选
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(data.items.map((it) => it.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [data.items])

  function refetch(next: ItemFilters) {
    startSearchTransition(async () => {
      try {
        const res = await searchItemsAction({
          spaceId,
          q: next.q,
          cat: next.cat,
          loc: next.loc,
          tag: next.tag,
          sort: next.sort,
          page: next.page,
          exp: next.exp,
        })
        setData(res)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "查询失败")
      }
    })
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", buildHref(next))
    }
  }

  const onFiltersChange = useCallback(
    (overrides: Partial<ItemFilters>) => {
      const next = { ...filters, ...overrides }
      setFilters(next)
      refetch(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters]
  )

  function onPageChange(p: number) {
    const next = { ...filters, page: p }
    setFilters(next)
    refetch(next)
  }

  const refreshCurrent = useCallback(() => {
    refetch(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const [createState, createFormAction, createPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createItemAction, undefined)
  useEffect(() => {
    if (createState?.ok) {
      setCreateOpen(false)
      toast.success("已创建")
      refreshCurrent()
    } else if (createState?.error) {
      toast.error(createState.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState])

  const [editState, editFormAction, editPending] = useActionState<
    ActionState | undefined,
    FormData
  >(updateItemAction, undefined)
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false)
      setEditing(null)
      setEditingTagIds([])
      toast.success("已更新")
      refreshCurrent()
    } else if (editState?.error) {
      toast.error(editState.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState])

  function openEdit(it: ItemRow) {
    setEditing(it)
    setEditingTagIds(data.tagsByItem[it.id]?.map((t) => t.id) ?? [])
    setEditOpen(true)
  }
  async function handleDelete(it: ItemRow) {
    if (
      !(await confirm({
        title: `删除物品「${it.name}」？`,
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    setDeletingId(it.id)
    const fd = new FormData()
    fd.append("id", String(it.id))
    startDelete(async () => {
      const res = await deleteItemAction(fd)
      setDeletingId(null)
      if (res.error) toast.error(res.error)
      else {
        toast.success("已删除")
        refreshCurrent()
      }
    })
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return
    if (
      !(await confirm({
        title: `删除所选 ${selected.size} 件物品？`,
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    setBatchPending(true)
    const fd = new FormData()
    fd.append("ids", [...selected].join(","))
    startDelete(async () => {
      const res = await deleteItemsAction(fd)
      setBatchPending(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`已删除 ${selected.size} 件`)
      clearSelection()
      refreshCurrent()
    })
  }

  const allSelected =
    data.items.length > 0 && data.items.every((it) => selected.has(it.id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="size-5" />
          <h1 className="text-xl font-semibold">物品</h1>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex border rounded-md">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => changeView("list")}
              aria-label="列表视图"
              aria-pressed={view === "list"}
              className="rounded-r-none"
            >
              <ListIcon className="size-4" />
            </Button>
            <Button
              variant={view === "card" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => changeView("card")}
              aria-label="卡片视图"
              aria-pressed={view === "card"}
              className="rounded-l-none"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
          {data.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (allSelected) clearSelection()
                else setSelected(new Set(data.items.map((it) => it.id)))
              }}
            >
              {allSelected ? "取消全选" : "全选"}
            </Button>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                添加物品
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>添加物品</DialogTitle>
                <DialogDescription>记录收纳物品，支持图片（≤9 张）</DialogDescription>
              </DialogHeader>
              <ItemForm
                mode="create"
                spaceId={spaceId}
                categories={categories}
                locations={locations}
                tags={tags}
                initialImages={[]}
                formAction={createFormAction}
                pending={createPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <FilterBar
        filters={filters}
        categories={categories}
        locations={locations}
        tags={tags}
        total={data.total}
        pending={searchPending}
        spaceId={spaceId}
        onFiltersChange={onFiltersChange}
      />

      <BatchBar
        count={selected.size}
        pending={batchPending}
        onClear={clearSelection}
        onDelete={handleBatchDelete}
      />

      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
          {data.total === 0
            ? "暂无物品。点击右上角「添加物品」开始。"
            : "当前筛选下无结果。"}
        </p>
      ) : view === "list" ? (
        <ItemRowList
          items={data.items}
          firstImages={data.firstImages}
          tagsByItem={data.tagsByItem}
          selected={selected}
          deletingId={deletingId}
          onToggleSelect={toggleSelect}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : (
        <ItemCardGrid
          items={data.items}
          firstImages={data.firstImages}
          tagsByItem={data.tagsByItem}
          selected={selected}
          deletingId={deletingId}
          onToggleSelect={toggleSelect}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={pageSize}
        pending={searchPending}
        onPageChange={onPageChange}
      />

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) {
            setEditing(null)
            setEditingTagIds([])
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑物品</DialogTitle>
          </DialogHeader>
          {editing && (
            <ItemForm
              mode="edit"
              spaceId={spaceId}
              item={editing}
              initialImages={data.imagesByItem[editing.id] ?? []}
              initialTagIds={editingTagIds}
              categories={categories}
              locations={locations}
              tags={tags}
              formAction={editFormAction}
              pending={editPending}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}
