"use client"

import { useActionState, useEffect, useState } from "react"
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
import { LocationTreeSelect, type LocNode } from "@/components/location-tree-select"
import { createItemAction } from "@/lib/actions/items"
import { type ActionState } from "@/lib/actions/types"
import { RequiredMark } from "@/components/ui/required-mark"
import { toast } from "sonner"

export type QuickAddLoc = LocNode

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: number
  locations: QuickAddLoc[]
}

/** 全局快速录入：仅名称必填，位置可选；图片/分类/标签去详情页补 */
export function QuickAddItemDialog({ open, onOpenChange, spaceId, locations }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(createItemAction, undefined)
  const [locId, setLocId] = useState<number | null>(null)

  useEffect(() => {
    if (state?.ok) {
      onOpenChange(false)
      toast.success("已添加")
      router.refresh()
    }
  }, [state, onOpenChange, router])

  // 打开时重置位置选择
  useEffect(() => {
    if (open) setLocId(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>快速录入物品</DialogTitle>
          <DialogDescription>只填名称就够了，图片和分类去详情页补</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="spaceId" value={spaceId} />
          <input
            type="hidden"
            name="locationId"
            value={locId == null ? "" : String(locId)}
          />

          <div className="space-y-1.5">
            <Label htmlFor="quick-item-name">名称<RequiredMark /></Label>
            <Input
              id="quick-item-name"
              name="name"
              required
              minLength={1}
              maxLength={50}
              autoFocus
              disabled={pending}
              placeholder="如：一袋米"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="quick-item-qty">数量<RequiredMark /></Label>
              <Input
                id="quick-item-qty"
                name="quantity"
                type="number"
                min={1}
                defaultValue={1}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-item-unit">单位</Label>
              <Input
                id="quick-item-unit"
                name="unit"
                maxLength={20}
                placeholder="个/件/盒"
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-item-price">价格</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
              <Input
                id="quick-item-price"
                name="price"
                type="number"
                min={0}
                step={0.01}
                placeholder="不设"
                disabled={pending}
                className="pl-6"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>位置</Label>
            <LocationTreeSelect
              locations={locations}
              value={locId}
              onChange={setLocId}
              disabled={pending}
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
