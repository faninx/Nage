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
import { expiryBucket, expiryClass, expiryLabelDetail } from "@/lib/expiry"
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
  RotateCcw,
  Trash2,
  Package,
  X,
  ZoomIn,
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
      // v1.2.2: router.refresh() / router.replace() 在 Next 16 dev mode + Turbopack
      // 都没让 client 真的拿到新 item prop (list 页 + 详情页实测都失败)。
      // 兜底：window.location.reload() —— 跟用户硬刷新等价，server 真的重新 SSR。
      window.location.reload()
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
        // v1.2.2: router.push + router.refresh 同样不更新，window.location.assign 兜底
        window.location.assign("/items")
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

        {item.expiredAt && item.daysUntilExpired !== null && (
          <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr] gap-3 py-2.5">
            <div className="text-sm text-muted-foreground">过期时间</div>
            <div className={cn("text-sm", expiryClass(expiryBucket(item.daysUntilExpired)))}>
              {expiryLabelDetail(item.daysUntilExpired, item.expiredAt)}
            </div>
          </div>
        )}
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
// 点击任意图进入全屏放大查看（ZoomView）
// ============================================================
function ImageCarousel({
  images,
  alt,
}: {
  images: { id: number; path: string; sortOrder: number }[]
  alt: string
}) {
  const [idx, setIdx] = useState(0)
  const [zoomIdx, setZoomIdx] = useState<number | null>(null)
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

  // 全屏模式下方向键翻页
  useEffect(() => {
    if (zoomIdx === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        setZoomIdx((i) =>
          i === null ? null : (i - 1 + images.length) % images.length
        )
      } else if (e.key === "ArrowRight") {
        setZoomIdx((i) =>
          i === null ? null : (i + 1) % images.length
        )
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [zoomIdx, images.length])

  function go(delta: number) {
    const el = scrollRef.current
    if (!el) return
    // 回环:最后一张的下一张 = 第一张
    const next = ((idx + delta) % images.length + images.length) % images.length
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" })
  }

  function openZoom(i: number) {
    setZoomIdx(i)
  }

  function closeZoom() {
    // 关闭时把轮播滚回用户最后查看的那张,保证体验一致
    if (zoomIdx !== null) {
      const el = scrollRef.current
      if (el) {
        el.scrollTo({ left: zoomIdx * el.clientWidth })
        setIdx(zoomIdx)
      }
    }
    setZoomIdx(null)
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
            <button
              key={img.id}
              type="button"
              onClick={() => openZoom(i)}
              aria-label={`查看大图 ${i + 1} / ${images.length}`}
              className="snap-center shrink-0 w-full aspect-video relative bg-black/5 p-0 border-0 cursor-zoom-in block group"
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
              {/* 悬停时右下角放大镜 hint */}
              <span className="absolute bottom-2 right-2 size-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <ZoomIn className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80"
              onClick={() => go(-1)}
              aria-label="上一张"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80"
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

      {/* 全屏放大查看 */}
      <Dialog
        open={zoomIdx !== null}
        onOpenChange={(o) => !o && closeZoom()}
      >
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 w-screen h-screen max-w-none sm:max-w-none max-h-none p-0 bg-black border-0 ring-0 rounded-none top-0 left-0 translate-x-0 translate-y-0 gap-0 text-white overflow-hidden data-[state=open]:sm:max-w-none"
        >
          {zoomIdx !== null && (
            <ZoomView
              images={images}
              idx={zoomIdx}
              alt={alt}
              onClose={closeZoom}
              onPrev={() =>
                setZoomIdx((i) =>
                  i === null ? null : (i - 1 + images.length) % images.length
                )
              }
              onNext={() =>
                setZoomIdx((i) =>
                  i === null ? null : (i + 1) % images.length
                )
              }
              onJumpTo={(i) => setZoomIdx(i)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// ZoomView — 全屏看大图：天然像素尺寸 + 滚轮缩放(缩放点跟鼠标) + 拖拽平移
// 顶栏：计数+名称  ·  缩放%+1:1(居中)  ·  关闭
// 底部居中：所有图缩略图条(点切图 + 当前高亮)
// 侧栏：上下张(回环)
// ============================================================
function ZoomView({
  images,
  idx,
  alt,
  onClose,
  onPrev,
  onNext,
  onJumpTo,
}: {
  images: { id: number; path: string; sortOrder: number }[]
  idx: number
  alt: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onJumpTo: (i: number) => void
}) {
  const img = images[idx]
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  // 拖拽起点(用 ref 存避免 re-render)
  const dragRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
    pointerId: number
  } | null>(null)

  // 切图时重置缩放/平移
  useEffect(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
    // 缓存图片 onLoad 可能不冒泡,这里补一刀:下一帧如果 naturalWidth 已经有值就直接 1:1 居中
    const id = requestAnimationFrame(() => {
      const el = imgRef.current
      if (el && el.naturalWidth && el.naturalHeight) {
        fitTo1to1()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [idx])

  // 1:1 居中:把图片放到视口正中央(小图也居中,大图也居中露出中间)
  // 只读稳定 ref + 稳定 setter,无 stale closure,放心从任何地方调
  function fitTo1to1() {
    const c = containerRef.current
    const el = imgRef.current
    if (!c || !el || !el.naturalWidth || !el.naturalHeight) return
    setPan({
      x: (c.clientWidth - el.naturalWidth) / 2,
      y: (c.clientHeight - el.naturalHeight) / 2,
    })
    setScale(1)
  }

  function onImageLoad() {
    fitTo1to1()
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const c = containerRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    // 指数缩放:小滚动 = 小变化,大滚动 = 大变化;比线性更自然
    const factor = Math.exp(-e.deltaY * 0.002)
    const newScale = Math.max(0.1, Math.min(10, scale * factor))
    if (newScale === scale) return
    // 缩放点跟着鼠标:cursor = pan + point * scale
    //   => newPan = cursor - (cursor - pan) / scale * newScale
    const newPanX = cx - ((cx - pan.x) / scale) * newScale
    const newPanY = cy - ((cy - pan.y) / scale) * newScale
    setScale(newScale)
    setPan({ x: newPanX, y: newPanY })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      pointerId: e.pointerId,
    }
    setIsDragging(true)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragRef.current?.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    dragRef.current = null
    setIsDragging(false)
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* a11y: 给 screen reader 读,视觉上是顶栏自定义的「1/N 名称」 */}
      <DialogTitle className="sr-only">
        {alt}（{idx + 1} / {images.length}）
      </DialogTitle>

      {/* 顶栏:左 name · 中 缩放%+1:1 · 右 X */}
      <div className="flex items-center gap-2 px-4 py-3 text-sm shrink-0 z-10">
        {/* 左:计数 + 名称 */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono tabular-nums text-white/80 shrink-0">
            {idx + 1} / {images.length}
          </span>
          <span className="text-white/60 truncate">{alt}</span>
        </div>

        {/* 中:缩放% + 1:1 按钮(居中分组) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono tabular-nums text-white/60 text-sm px-1 min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fitTo1to1}
            aria-label="重置到 1:1 实际大小"
            title="重置缩放 (1:1 实际大小)"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>

        {/* 右:关闭(占满右半边推到最右) */}
        <div className="flex items-center justify-end flex-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="关闭"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* 图像区域:容器 + 底部缩略图条 + 上下张 */}
      <div className="relative flex-1 min-h-0">
        {/* 图容器(滚轮缩放 + 拖拽平移) */}
        <div
          ref={containerRef}
          className={cn(
            "absolute inset-0 overflow-hidden touch-none select-none",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={img.path}
            alt={`${alt} ${idx + 1}`}
            onLoad={onImageLoad}
            draggable={false}
            className="absolute top-0 left-0 max-w-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          />
        </div>

        {/* 底部居中缩略图条:点切图 + 当前高亮 */}
        {images.length > 1 && (
          <div className="absolute bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm z-20 max-w-full overflow-x-auto"
               style={{ scrollbarWidth: "none" }}>
            {images.map((im, i) => (
              <button
                key={im.id}
                type="button"
                onClick={() => onJumpTo(i)}
                aria-label={`查看第 ${i + 1} 张`}
                aria-current={i === idx ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-md overflow-hidden border-2 border-transparent transition-all",
                  i === idx
                    ? "!border-white"
                    : "opacity-60 hover:opacity-100"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={im.path}
                  alt=""
                  draggable={false}
                  className="block size-16 object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* 侧栏上下张(回环) */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrev}
              aria-label="上一张"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ChevronLeft className="size-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              aria-label="下一张"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ChevronRight className="size-6" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// (MiniMap 已移除,改为底部缩略图条)
