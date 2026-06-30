"use client"

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DialogFooter } from "@/components/ui/dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/ui/required-mark"
import { LocationTreeSelect, type LocNode } from "@/components/location-tree-select"
import { TagsMultiSelect, type TagOpt } from "@/components/tags-multi-select"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { deleteItemImageAction } from "@/lib/actions/images"
import { MAX_IMAGES_PER_ITEM } from "@/lib/actions/types"
import { ImagePlus, X, ArrowUp, ArrowDown, Camera } from "lucide-react"
import { toast } from "sonner"

export type ItemFormItem = {
  id: number
  name: string
  description: string | null
  quantity: number
  unit: string | null
  price: number | null
  categoryId: number | null
  locationId: number | null
  expiredAt: string | null
}

export type ItemFormImage = {
  id: number
  path: string
  sortOrder: number
}

export type CategoryOpt = {
  id: number
  name: string
  icon: string | null
}

export const ITEM_FORM_UNSET = "__unset__"

// ============================================================
// ImageField
// ============================================================
export function ImageField({
  initialImages,
  disabled,
  onBusyChange,
}: {
  initialImages: ItemFormImage[]
  disabled: boolean
  /** 删除/上传等异步操作进行中→true；父级用此禁用保存按钮，避免与 imageOrder 字段产生 race */
  onBusyChange?: (busy: boolean) => void
}) {
  const [existing, setExisting] = useState(initialImages)
  const [pending, setPending] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [, startDelete] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    onBusyChange?.(isDeleting)
  }, [isDeleting, onBusyChange])

  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [pending])

  const slots = MAX_IMAGES_PER_ITEM - existing.length - pending.length
  const innerDisabled = disabled || isDeleting

  function syncInputFiles(next: File[]) {
    if (!inputRef.current) return
    const dt = new DataTransfer()
    next.forEach((f) => dt.items.add(f))
    inputRef.current.files = dt.files
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const allowed = files.slice(0, slots)
    const next = [...pending, ...allowed]
    setPending(next)
    syncInputFiles(next)
    // 不要 e.target.value = ""：syncInputFiles 已经把 next 写进 input.files，
    // 再清空会把刚选的文件抹掉，提交时 formData.getAll("images") 拿到空数组，
    // uploadItemImages 会静默 return 0，用户看不到任何报错但图片没上传
  }

  function removePending(idx: number) {
    const next = pending.filter((_, i) => i !== idx)
    setPending(next)
    syncInputFiles(next)
  }

  // 重排 existing 里的图片；idx 越界不动
  function moveImage(idx: number, delta: -1 | 1) {
    setExisting((arr) => {
      const j = idx + delta
      if (j < 0 || j >= arr.length) return arr
      const next = [...arr]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  async function handleDeleteExisting(id: number) {
    if (
      !(await confirm({
        title: "删除图片？",
        description: "图片删除后无法恢复。",
        destructive: true,
        confirmText: "删除",
      }))
    )
      return
    const fd = new FormData()
    fd.append("id", String(id))
    setIsDeleting(true)
    startDelete(async () => {
      try {
        const res = await deleteItemImageAction(undefined, fd)
        if (res.error) {
          toast.error(res.error)
        } else {
          setExisting((arr) => arr.filter((im) => im.id !== id))
          toast.success("已删除")
        }
      } finally {
        setIsDeleting(false)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <Label>图片（{existing.length + pending.length}/{MAX_IMAGES_PER_ITEM}）</Label>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {existing.map((img, i) => (
          <div
            key={img.id}
            className="relative aspect-square rounded-md overflow-hidden border bg-muted group"
          >
            <Image
              src={img.path}
              alt=""
              fill
              sizes="120px"
              className="object-cover"
              unoptimized
            />
            {i === 0 && (
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium leading-none">
                封面
              </span>
            )}
            {existing.length > 1 && (
              <div className="absolute bottom-1 inset-x-1 flex justify-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => moveImage(i, -1)}
                  disabled={i === 0 || disabled}
                  className="size-6 rounded bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  aria-label="上移"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(i, 1)}
                  disabled={i === existing.length - 1 || disabled}
                  className="size-6 rounded bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  aria-label="下移"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => handleDeleteExisting(img.id)}
              disabled={disabled}
              className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity disabled:opacity-0"
              aria-label="删除"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {pending.map((f, idx) => (
          <div
            key={idx}
            className="relative aspect-square rounded-md overflow-hidden border bg-muted group ring-2 ring-primary/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previews[idx]}
              alt={f.name}
              className="absolute inset-0 size-full object-cover"
            />
            <button
              type="button"
              onClick={() => removePending(idx)}
              disabled={disabled}
              className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center"
              aria-label="移除"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {slots > 0 && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="hidden md:flex aspect-square rounded-md border border-dashed flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-xs"
            >
              <ImagePlus className="size-5" />
              添加图片
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
              className="md:hidden aspect-square rounded-md border border-dashed flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-xs"
            >
              <Camera className="size-5" />
              拍照
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="md:hidden aspect-square rounded-md border border-dashed flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-xs"
            >
              <ImagePlus className="size-5" />
              相册
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        name="images"
        accept="image/*"
        multiple
        onChange={onFileChange}
        className="hidden"
        disabled={disabled}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onFileChange}
        className="hidden"
        disabled={disabled}
      />
      {existing.length > 0 && (
        // 服务端用这个字段重排 sortOrder；新上传的 pending 不参与,走 max+1 追加末尾
        <input
          type="hidden"
          name="imageOrder"
          value={existing.map((im) => im.id).join(",")}
        />
      )}
      <p className="text-xs text-muted-foreground">
        单张 ≤10MB，自动压缩到1080p JPEG（质量80）
      </p>
      {confirmDialog}
    </div>
  )
}

// ============================================================
// ItemForm
// ============================================================
export function ItemForm({
  mode,
  spaceId,
  item,
  initialImages,
  initialTagIds,
  categories,
  locations,
  tags,
  formAction,
  pending,
  submitLabel,
}: {
  mode: "create" | "edit"
  spaceId: number
  item?: ItemFormItem
  initialImages: ItemFormImage[]
  initialTagIds?: number[]
  categories: CategoryOpt[]
  locations: LocNode[]
  tags: TagOpt[]
  formAction: (data: FormData) => void
  pending: boolean
  /** 覆盖默认按钮文案(create 默认"创建",edit 默认"保存");通常跟 DialogTitle 动词对齐 */
  submitLabel?: string
}) {
  const [cat, setCat] = useState<string>(
    item?.categoryId ? String(item.categoryId) : ITEM_FORM_UNSET
  )
  const [locId, setLocId] = useState<number | null>(item?.locationId ?? null)
  const [tagIds, setTagIds] = useState<number[]>(initialTagIds ?? [])
  const [expiredAt, setExpiredAt] = useState<string | null>(
    item?.expiredAt ? item.expiredAt.slice(0, 10) : null
  )
  const [imageBusy, setImageBusy] = useState(false)
  const effectiveDisabled = pending || imageBusy

  return (
    <form action={formAction} className="space-y-3">
      {mode === "create" && <input type="hidden" name="spaceId" value={spaceId} />}
      {mode === "edit" && item && <input type="hidden" name="id" value={item.id} />}

      <div className="space-y-1.5">
        <Label htmlFor={`i-${mode}-name`}>名称<RequiredMark /></Label>
        <Input
          id={`i-${mode}-name`}
          name="name"
          required
          maxLength={50}
          defaultValue={item?.name ?? ""}
          autoFocus
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`i-${mode}-desc`}>描述</Label>
        <Textarea
          id={`i-${mode}-desc`}
          name="description"
          rows={3}
          maxLength={5000}
          defaultValue={item?.description ?? ""}
          disabled={pending}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`i-${mode}-qty`}>数量<RequiredMark /></Label>
          <Input
            id={`i-${mode}-qty`}
            name="quantity"
            type="number"
            min={1}
            step={1}
            defaultValue={item?.quantity ?? 1}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`i-${mode}-unit`}>单位</Label>
          <Input
            id={`i-${mode}-unit`}
            name="unit"
            maxLength={20}
            placeholder="个/件/盒"
            defaultValue={item?.unit ?? ""}
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`i-${mode}-price`}>价格</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
          <Input
            id={`i-${mode}-price`}
            name="price"
            type="number"
            min={0}
            step={0.01}
            placeholder="不设"
            defaultValue={item?.price ?? ""}
            disabled={pending}
            className="pl-6"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`i-${mode}-cat`}>分类</Label>
        <Select value={cat} onValueChange={setCat} disabled={pending}>
          <SelectTrigger className="w-full" id={`i-${mode}-cat`}>
            <SelectValue placeholder="（不选）" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ITEM_FORM_UNSET}>（不选）</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="hidden"
          name="categoryId"
          value={cat === ITEM_FORM_UNSET ? "" : cat}
        />
      </div>

      <div className="space-y-1.5">
        <Label>位置</Label>
        <LocationTreeSelect
          locations={locations}
          value={locId}
          onChange={setLocId}
          disabled={pending}
        />
        <input
          type="hidden"
          name="locationId"
          value={locId == null ? "" : String(locId)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>标签</Label>
        <TagsMultiSelect
          tags={tags}
          value={tagIds}
          onChange={setTagIds}
          disabled={pending}
          spaceId={spaceId}
        />
        <input type="hidden" name="tagIds" value={tagIds.join(",")} />
      </div>

      <div className="space-y-1.5">
        <Label>过期时间</Label>
        <DatePicker
          id={`i-${mode}-exp`}
          name="expiredAt"
          value={expiredAt}
          onChange={setExpiredAt}
          disabled={pending}
          placeholder="不设（永久有效）"
        />
        <p className="text-xs text-muted-foreground">
          留空表示永久有效。快过期会在仪表盘提醒。
        </p>
      </div>

      <ImageField
        initialImages={initialImages}
        disabled={effectiveDisabled}
        onBusyChange={setImageBusy}
      />

      <DialogFooter showCloseButton>
        <Button type="submit" disabled={effectiveDisabled}>
          {effectiveDisabled ? "保存中…" : submitLabel ?? (mode === "create" ? "创建" : "保存")}
        </Button>
      </DialogFooter>
    </form>
  )
}
