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
import { updateMyNicknameAction } from "@/lib/actions/profile"
import { type ActionState } from "@/lib/actions/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialNickname: string
}

/** 修改昵称弹窗（受控：父组件控制 open） */
export function NicknameEditorDialog({ open, onOpenChange, initialNickname }: Props) {
  const [nickname, setNickname] = useState(initialNickname)
  const [state, formAction, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(updateMyNicknameAction, undefined)

  useEffect(() => {
    if (state?.ok) {
      onOpenChange(false)
    } else if (state?.error) {
      // 不关闭弹窗，让用户重试
    }
  }, [state, onOpenChange])

  // 弹窗打开时同步最新值
  useEffect(() => {
    if (open) setNickname(initialNickname)
  }, [open, initialNickname])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改昵称</DialogTitle>
          <DialogDescription>昵称会显示在顶栏、仪表盘、成员列表等地方</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="my-nickname">昵称</Label>
            <Input
              id="my-nickname"
              name="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              minLength={1}
              maxLength={50}
              autoFocus
              disabled={pending}
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending || nickname.trim() === ""}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
