"use client"

import { useActionState, useEffect, useState } from "react"
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
import { changeMyPasswordAction } from "@/lib/actions/profile"
import { type ActionState } from "@/lib/actions/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 修改密码弹窗（受控） */
export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [state, formAction, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(changeMyPasswordAction, undefined)
  const [confirmValue, setConfirmValue] = useState("")

  useEffect(() => {
    if (state?.ok) {
      onOpenChange(false)
      setConfirmValue("")
    }
  }, [state, onOpenChange])

  // 关闭时清空敏感字段
  useEffect(() => {
    if (!open) setConfirmValue("")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>修改后下次登录需使用新密码</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="my-current-pw">当前密码</Label>
            <Input
              id="my-current-pw"
              name="currentPassword"
              type="password"
              required
              minLength={6}
              maxLength={128}
              autoFocus
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="my-new-pw">新密码</Label>
            <Input
              id="my-new-pw"
              name="newPassword"
              type="password"
              required
              minLength={6}
              maxLength={128}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="my-confirm-pw">确认新密码</Label>
            <Input
              id="my-confirm-pw"
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              maxLength={128}
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
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
