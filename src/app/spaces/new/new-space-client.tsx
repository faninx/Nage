"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSpaceAction } from "@/lib/actions/spaces"
import type { ActionState } from "@/lib/actions/types"
import { toast } from "sonner"

type Props = {
  defaultName: string
}

export function NewSpaceClient({ defaultName }: Props) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [state, formAction, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(createSpaceAction, undefined)

  useEffect(() => {
    if (state?.ok) {
      toast.success("空间已创建并切换")
      router.push("/")
      router.refresh()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="space-name">空间名</Label>
        <Input
          id="space-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：办公室 / 老家 / 实验室"
          required
          minLength={1}
          maxLength={50}
          autoFocus
          disabled={pending}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || name.trim().length === 0}>
          {pending ? "创建中…" : "创建"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/")}>
          取消
        </Button>
      </div>
    </form>
  )
}
