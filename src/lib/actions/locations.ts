"use server"

import { revalidatePath } from "next/cache"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { locations, type SpaceRole } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateLocationSchema,
  RenameLocationSchema,
  DeleteLocationSchema,
  MoveLocationSchema,
  ReorderLocationSchema,
} from "@/lib/validation/schemas"
import type { ActionState } from "./types"

const MAX_DEPTH = 5

/** 用 parent 链向上走算深度（root=1）。最多走 MAX_DEPTH + 1 步。 */
async function getDepth(locationId: number): Promise<number> {
  let currentId: number | null = locationId
  let depth = 0
  const visited = new Set<number>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    depth++
    if (depth > MAX_DEPTH + 1) break
    const [row] = await db
      .select({ parentId: locations.parentId })
      .from(locations)
      .where(eq(locations.id, currentId))
      .limit(1)
    currentId = row?.parentId ?? null
  }
  return depth
}

/** 算以某 id 为根的子树最大深度。 */
async function getSubtreeDepth(locationId: number): Promise<number> {
  // BFS，最多 MAX_DEPTH 层
  let level = [locationId]
  let depth = 0
  const visited = new Set<number>([locationId])
  while (level.length > 0 && depth < MAX_DEPTH + 1) {
    depth++
    const next: number[] = []
    for (const id of level) {
      const children = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.parentId, id))
      for (const c of children) {
        if (!visited.has(c.id)) {
          visited.add(c.id)
          next.push(c.id)
        }
      }
    }
    level = next
  }
  return depth
}

/** 检查 newParentId 是否是 locationId 的后代。 */
async function isDescendant(
  ancestorId: number,
  candidateId: number
): Promise<boolean> {
  const children = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.parentId, ancestorId))
  for (const c of children) {
    if (c.id === candidateId) return true
    if (await isDescendant(c.id, candidateId)) return true
  }
  return false
}

async function getSpaceOfLocation(locationId: number): Promise<number | null> {
  const [row] = await db
    .select({ spaceId: locations.spaceId })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1)
  return row?.spaceId ?? null
}

async function userAccessToLocation(
  userId: number,
  locationId: number,
  minRole: SpaceRole = "editor"
): Promise<{ ok: boolean; spaceId: number | null }> {
  const spaceId = await getSpaceOfLocation(locationId)
  if (!spaceId) return { ok: false, spaceId: null }
  const ok = await hasSpaceAccess(userId, spaceId, minRole)
  return { ok, spaceId }
}

export async function createLocationAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = CreateLocationSchema.safeParse({
    spaceId: formData.get("spaceId"),
    parentId: formData.get("parentId") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, parentId, name, description } = parsed.data

  if (!(await hasSpaceAccess(user.id, spaceId, "editor"))) {
    return { error: "无权操作该空间" }
  }

  if (parentId) {
    const parentDepth = await getDepth(parentId)
    if (parentDepth >= MAX_DEPTH) {
      return { error: `位置层级最多 ${MAX_DEPTH} 级` }
    }
    const parentSpaceId = await getSpaceOfLocation(parentId)
    if (parentSpaceId !== spaceId) return { error: "父位置不在同一空间" }

    const [sib] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.parentId, parentId), eq(locations.name, name)))
      .limit(1)
    if (sib) return { error: "同一位置下已存在同名子位置" }
  } else {
    const [sib] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.spaceId, spaceId),
          sql`${locations.parentId} IS NULL`,
          eq(locations.name, name)
        )
      )
      .limit(1)
    if (sib) return { error: "该空间根位置已存在同名" }
  }

  await db.insert(locations).values({
    spaceId,
    parentId: parentId ?? null,
    name,
    description: description || null,
  })
  revalidatePath("/locations")
  return { ok: true }
}

export async function renameLocationAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = RenameLocationSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name } = parsed.data

  const access = await userAccessToLocation(user.id, id, "editor")
  if (!access.ok) return { error: "无权操作" }

  await db.update(locations).set({ name }).where(eq(locations.id, id))
  revalidatePath("/locations")
  return { ok: true }
}

export async function deleteLocationAction(formData: FormData): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteLocationSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  const access = await userAccessToLocation(user.id, id, "editor")
  if (!access.ok) return { error: "无权操作" }

  // cascade 子树由 FK onDelete: cascade 处理
  await db.delete(locations).where(eq(locations.id, id))
  revalidatePath("/locations")
  return { ok: true }
}

export async function moveLocationAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const rawNewParent = formData.get("newParentId")
  const parsed = MoveLocationSchema.safeParse({
    id: formData.get("id"),
    newParentId: rawNewParent === "" || rawNewParent === null ? null : rawNewParent,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, newParentId } = parsed.data

  const access = await userAccessToLocation(user.id, id, "editor")
  if (!access.ok) return { error: "无权操作" }

  if (newParentId === id) return { error: "不能移到自身" }

  if (newParentId) {
    if (await isDescendant(id, newParentId)) {
      return { error: "不能移到自己的子位置" }
    }
    const parentSpaceId = await getSpaceOfLocation(newParentId)
    if (parentSpaceId !== access.spaceId) return { error: "新父位置不在同一空间" }
  }

  const subtreeDepth = await getSubtreeDepth(id)
  const newParentDepth = newParentId ? await getDepth(newParentId) : 0
  if (newParentDepth + subtreeDepth > MAX_DEPTH) {
    return { error: `移动后层级将超过 ${MAX_DEPTH} 级` }
  }

  await db
    .update(locations)
    .set({ parentId: newParentId })
    .where(eq(locations.id, id))
  revalidatePath("/locations")
  return { ok: true }
}

/**
 * 拖拽：把 id 移到 newParentId 下，beforeId 之前；beforeId 为空/0/null 表示末尾
 * 1) 改 parentId
 * 2) 把目标父级下的所有同层 sibling（含自己）按"before 之前 + 自己 + 之后"的顺序重新分配 sortOrder
 * 3) 深度校验沿用 moveLocationAction 的逻辑
 */
export async function reorderLocationAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const rawNewParent = formData.get("newParentId")
  const rawBefore = formData.get("beforeId")
  const parsed = ReorderLocationSchema.safeParse({
    id: formData.get("id"),
    newParentId:
      rawNewParent === "" || rawNewParent === null ? null : rawNewParent,
    beforeId: rawBefore === "" || rawBefore === null || rawBefore === undefined ? null : rawBefore,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, newParentId, beforeId } = parsed.data

  const access = await userAccessToLocation(user.id, id, "editor")
  if (!access.ok) return { error: "无权操作" }

  if (newParentId === id) return { error: "不能移到自身" }
  if (beforeId === id) return { error: "排序参考无效" }

  if (newParentId) {
    if (await isDescendant(id, newParentId)) {
      return { error: "不能移到自己的子位置" }
    }
    const parentSpaceId = await getSpaceOfLocation(newParentId)
    if (parentSpaceId !== access.spaceId) return { error: "新父位置不在同一空间" }
  }
  if (beforeId) {
    const beforeSpaceId = await getSpaceOfLocation(beforeId)
    if (beforeSpaceId !== access.spaceId) return { error: "排序参考不在同一空间" }
  }

  const subtreeDepth = await getSubtreeDepth(id)
  const newParentDepth = newParentId ? await getDepth(newParentId) : 0
  if (newParentDepth + subtreeDepth > MAX_DEPTH) {
    return { error: `移动后层级将超过 ${MAX_DEPTH} 级` }
  }

  // 1) 目标父级下"现存的" sibling（不含 id 自己）按当前 sortOrder + id 排序
  const siblings = await db
    .select({ id: locations.id, parentId: locations.parentId, sortOrder: locations.sortOrder })
    .from(locations)
    .where(
      newParentId
        ? eq(locations.parentId, newParentId)
        : and(
            eq(locations.spaceId, access.spaceId!),
            sql`${locations.parentId} IS NULL`
          )
    )
    .orderBy(locations.sortOrder, locations.id)

  // 2) 算出最终顺序
  const filtered = siblings.filter((s) => s.id !== id)
  const beforeIdx = beforeId ? filtered.findIndex((s) => s.id === beforeId) : -1
  const insertIdx = beforeIdx === -1 ? filtered.length : beforeIdx
  filtered.splice(insertIdx, 0, { id, parentId: newParentId, sortOrder: 0 })

  // 3) 事务：先改 parentId，再批量刷 sortOrder
  const { sql: drizzleSql } = await import("drizzle-orm")
  // better-sqlite3 同步事务
  db.transaction((tx) => {
    tx.update(locations).set({ parentId: newParentId }).where(eq(locations.id, id)).run()
    for (let i = 0; i < filtered.length; i++) {
      tx.update(locations)
        .set({ sortOrder: (i + 1) * 10 })
        .where(eq(locations.id, filtered[i].id))
        .run()
    }
    // 引用一下以避免 unused 警告
    void drizzleSql
  })

  revalidatePath("/locations")
  return { ok: true }
}
