"use server"

import { revalidatePath } from "next/cache"
import { requireSession } from "@/lib/auth/session"
import { setCurrentSpaceId } from "@/lib/auth/space-access"
import { z } from "zod"
import type { ActionState } from "./types"

const SwitchSpaceSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
})

export async function setCurrentSpaceAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = SwitchSpaceSchema.safeParse({ spaceId: formData.get("spaceId") })
  if (!parsed.success) return { error: "参数错误" }
  await setCurrentSpaceId(user.id, parsed.data.spaceId)
  revalidatePath("/", "layout")
  return { ok: true }
}
