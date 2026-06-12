"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { QuickAddItemDialog, type QuickAddLoc } from "./quick-add-item-dialog"

type Props = {
  spaceId: number
  locations: QuickAddLoc[]
}

/** 全局悬浮 "+" 按钮：右下角，PC 离视口 24px，移动端离底部 Tab 80px（含安全区） */
export function QuickAddFab({ spaceId, locations }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="添加物品"
        title="添加物品"
        className={cn(
          "fixed z-30 inline-flex items-center justify-center",
          "size-14 rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-foreground/5",
          "hover:scale-105 hover:shadow-xl active:scale-95 transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          // 移动端：底部 Tab (h-14=56px) + 24px 间距 = 80px = 5rem
          // + env(safe-area-inset-bottom) 避开 iPhone Home Indicator
          "right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))]",
          "md:bottom-6 md:right-6"
        )}
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
      <QuickAddItemDialog
        open={open}
        onOpenChange={setOpen}
        spaceId={spaceId}
        locations={locations}
      />
    </>
  )
}
