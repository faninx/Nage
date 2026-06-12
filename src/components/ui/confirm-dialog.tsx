"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

type Resolver = (v: boolean) => void

/**
 * 自定义 confirm 弹窗（替代浏览器原生 confirm）
 *
 * 用法：
 *   const { confirm, dialog } = useConfirm()
 *   async function handleDelete() {
 *     if (!(await confirm({ title: "确定删除？", destructive: true }))) return
 *     // ...
 *   }
 *   return <>...{dialog}</>
 */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  const confirm = useCallback(
    (options: string | ConfirmOptions): Promise<boolean> => {
      const normalized: ConfirmOptions =
        typeof options === "string" ? { title: options } : options
      setOpts(normalized)
      setOpen(true)
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve
      })
    },
    []
  )

  function settle(result: boolean) {
    const r = resolverRef.current
    resolverRef.current = null
    setOpen(false)
    r?.(result)
  }

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) settle(false)
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
          {opts?.description && (
            <DialogDescription>{opts.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            {opts?.cancelText ?? "取消"}
          </Button>
          <Button
            variant={opts?.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {opts?.confirmText ?? "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { confirm, dialog }
}
