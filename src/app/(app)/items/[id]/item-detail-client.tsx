"use client"

import { useActionState, useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteItemAction, updateItemAction } from "@/lib/actions/items"
import { type ActionState } from "@/lib/actions/types"
import { formatPrice } from "@/lib/format"
import { ItemForm, type CategoryOpt } from "../item-form"
import { type LocNode } from "@/components/location-tree-select"
import { type TagOpt } from "@/components/tags-multi-select"
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  QrCode,
  Trash2,
  Package,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export type ItemDetail = {
  id: number
  spaceId: number
  name: string
  description: string | null
  quantity: number
  unit: string | null
  price: number | null
  categoryId: number | null
  locationId: number | null
  category: { id: number; name: string; icon: string | null } | null
  breadcrumb: LocBreadcrumb[]
  tags: { id: number; name: string; color: string | null }[]
  images: { id: number; path: string; sortOrder: number }[]
  expiredAt: string | null
  /** 正数 = N 天后过期；0 = 今日；负数 = 已过期 N 天；null = 未设置 */
  daysUntilExpired: number | null
  createdAt: string
  updatedAt: string
}

export type LocBreadcrumb = { id: number; name: string }

type Props = {
  item: ItemDetail
  categories: CategoryOpt[]
  locations: LocNode[]
  tags: TagOpt[]
}

export function ItemDetailClient({ item, categories, locations, tags }: Props) {
  const router = useRouter()
  const [, startDelete] = useTransition()
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const [editState, editFormAction, editPending] = useActionState<
    ActionState | undefined,
    FormData
  >(updateItemAction, undefined)
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false)
      toast.success("已更新")
      router.refresh()
    } else if (editState?.error) {
      toast.error(editState.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState])

  function handleEdit() {
    setEditOpen(true)
  }

  function handleDelete() {
    setDeleting(true)
    const fd = new FormData()
    fd.append("id", String(item.id))
    startDelete(async () => {
      const res = await deleteItemAction(fd)
      setDeleting(false)
      if (res.error) {
        toast.error(res.error)
        setConfirmOpen(false)
      } else {
        toast.success("已删除")
        router.push("/items")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/items">
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setQrOpen(true)} disabled={item.id === undefined}>
            <QrCode className="size-4" />
            二维码
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="size-4" />
            编辑
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            删除
          </Button>
        </div>
      </div>

      {item.images.length > 0 && <ImageCarousel images={item.images} alt={item.name} />}

      <div>
        <h1 className="text-2xl font-semibold">{item.name}</h1>
      </div>

      {/* 属性表：Notion 风格，左列属性名（muted），右列属性值 */}
      <div className="border-y divide-y">
        <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
          <div className="text-sm text-muted-foreground">数量</div>
          <div className="text-sm">
            {item.quantity}
            {item.unit ? ` ${item.unit}` : ""}
          </div>
        </div>

        {item.price != null && (
          <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
            <div className="text-sm text-muted-foreground">价格</div>
            <div className="text-sm">{formatPrice(item.price)}</div>
          </div>
        )}

        {item.category && (
          <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
            <div className="text-sm text-muted-foreground">分类</div>
            <div className="text-sm flex items-center gap-1.5 flex-wrap">
              <Link
                href={`/items?cat=${item.category.id}`}
                className="inline-flex items-center gap-1 hover:bg-muted/60 rounded-sm px-1 -mx-1 transition-colors"
              >
                {item.category.icon && <span>{item.category.icon}</span>}
                {item.category.name}
              </Link>
            </div>
          </div>
        )}

        {item.breadcrumb.length > 0 && (
          <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
            <div className="text-sm text-muted-foreground">位置</div>
            <div className="text-sm flex items-center gap-1 flex-wrap">
              {item.breadcrumb.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                  <Link
                    href={`/items?loc=${b.id}`}
                    className="hover:bg-muted/60 rounded-sm px-1 -mx-1 transition-colors"
                  >
                    {b.name}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
            <div className="text-sm text-muted-foreground">标签</div>
            <div className="text-sm flex items-center gap-1.5 flex-wrap">
              {item.tags.map((t) => (
                <Link
                  key={t.id}
                  href={`/items?tag=${t.id}`}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs hover:opacity-80 transition-opacity"
                  style={
                    t.color
                      ? { borderColor: t.color, color: t.color }
                      : undefined
                  }
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {item.expiredAt && item.daysUntilExpired !== null && (() => {
          const diffDays = item.daysUntilExpired
          const dateStr = new Date(item.expiredAt).toLocaleDateString("zh-CN")
          let label: string
          let cls: string
          if (diffDays < 0) {
            label = `已过期 ${-diffDays} 天（${dateStr}）`
            cls = "text-muted-foreground"
          } else if (diffDays <= 7) {
            label = `${diffDays} 天后过期（${dateStr}）`
            cls = "text-red-600 dark:text-red-400"
          } else if (diffDays <= 30) {
            label = `${diffDays} 天后过期（${dateStr}）`
            cls = "text-orange-600 dark:text-orange-400"
          } else {
            label = dateStr
            cls = "text-muted-foreground"
          }
          return (
            <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
              <div className="text-sm text-muted-foreground">
                过期时间
              </div>
              <div className={cn("text-sm", cls)}>{label}</div>
            </div>
          )
        })()}
      </div>

      {item.description && (
        <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
          <div className="text-sm text-muted-foreground">描述</div>
          <p className="text-sm whitespace-pre-wrap">{item.description}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground flex items-center gap-3 pt-2">
        <span className="flex items-center gap-1">
          <Calendar className="size-3" />
          创建于 {new Date(item.createdAt).toLocaleString("zh-CN")}
        </span>
        <span>更新于 {new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
      </div>

      {/* 二维码对话框（占位，M4 接入真实生成） */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>物品二维码</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {item.id !== undefined ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/qr/item/${item.id}`}
                alt={`物品 ${item.name} 的二维码`}
                className="size-64 border rounded bg-white p-2"
              />
            ) : (
              <div className="size-64 border rounded bg-muted flex items-center justify-center">
                <Package className="size-12 text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              扫码查看「{item.name}」
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除物品？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除「{item.name}」吗？此操作不可撤销，关联的图片和标签也会被删除。
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑（在当前页弹窗，不跳走） */}
      <Dialog open={editOpen} onOpenChange={(o) => !editPending && setEditOpen(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑物品</DialogTitle>
          </DialogHeader>
          <ItemForm
            mode="edit"
            spaceId={item.spaceId}
            item={{
              id: item.id,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              price: item.price,
              categoryId: item.categoryId,
              locationId: item.locationId,
              expiredAt: item.expiredAt,
            }}
            initialImages={item.images}
            initialTagIds={item.tags.map((t) => t.id)}
            categories={categories}
            locations={locations}
            tags={tags}
            formAction={editFormAction}
            pending={editPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// ImageCarousel — CSS scroll-snap, 简单高效，无依赖
// ============================================================
function ImageCarousel({
  images,
  alt,
}: {
  images: { id: number; path: string; sortOrder: number }[]
  alt: string
}) {
  const [idx, setIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      const i = Math.round(el.scrollLeft / el.clientWidth)
      setIdx(Math.max(0, Math.min(images.length - 1, i)))
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [images.length])

  function go(delta: number) {
    const el = scrollRef.current
    if (!el) return
    const next = Math.max(0, Math.min(images.length - 1, idx + delta))
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth rounded-lg border bg-muted"
          style={{ scrollbarWidth: "none" }}
        >
          {images.map((img, i) => (
            <div
              key={img.id}
              className="snap-center shrink-0 w-full aspect-video relative bg-black/5"
            >
              <Image
                src={img.path}
                alt={`${alt} ${i + 1}`}
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-contain"
                unoptimized
                priority={i === 0}
              />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              className={cn(
                "absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80",
                idx === 0 && "opacity-0 pointer-events-none"
              )}
              onClick={() => go(-1)}
              aria-label="上一张"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80",
                idx === images.length - 1 && "opacity-0 pointer-events-none"
              )}
              onClick={() => go(1)}
              aria-label="下一张"
            >
              <ChevronRight className="size-4" />
            </Button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1">
          {images.map((img, i) => (
            <span
              key={img.id}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === idx ? "bg-foreground" : "bg-foreground/20"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
