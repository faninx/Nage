"use server"

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, spaces } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  DeleteCategorySchema,
} from "@/lib/validation/schemas"
import type { ActionState } from "./types"

async function userOwnsSpace(userId: number, spaceId: number): Promise<boolean> {
  const [own] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, userId)))
    .limit(1)
  return !!own
}

export async function createCategoryAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = CreateCategorySchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    icon: formData.get("icon") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, name, icon } = parsed.data

  if (!(await userOwnsSpace(user.id, spaceId))) {
    return { error: "无权操作该空间" }
  }

  // 同 space 内 name 唯一
  const [sib] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.spaceId, spaceId), eq(categories.name, name)))
    .limit(1)
  if (sib) return { error: "该空间下已存在同名分类" }

  await db.insert(categories).values({
    spaceId,
    name,
    icon: icon || null,
  })
  revalidatePath("/categories")
  return { ok: true }
}

export async function updateCategoryAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = UpdateCategorySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    icon: formData.get("icon") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, icon } = parsed.data

  // 取原 category 校验 space 归属
  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1)
  if (!cat) return { error: "分类不存在" }
  if (!(await userOwnsSpace(user.id, cat.spaceId))) {
    return { error: "无权操作" }
  }

  // 重名检查（排除自己）
  const [sib] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.spaceId, cat.spaceId),
        eq(categories.name, name)
      )
    )
    .limit(1)
  if (sib && sib.id !== id) return { error: "该空间下已存在同名分类" }

  await db
    .update(categories)
    .set({
      name,
      icon: icon || null,
    })
    .where(eq(categories.id, id))
  revalidatePath("/categories")
  return { ok: true }
}

export async function deleteCategoryAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteCategorySchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1)
  if (!cat) return { error: "分类不存在" }
  if (!(await userOwnsSpace(user.id, cat.spaceId))) {
    return { error: "无权操作" }
  }

  // items.categoryId 由 schema 的 set null 处理
  await db.delete(categories).where(eq(categories.id, id))
  revalidatePath("/categories")
  return { ok: true }
}
