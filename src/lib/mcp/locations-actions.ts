/**
 * MCP 位置 write（create / update / delete）。
 *
 * 与 src/lib/actions/locations.ts 的 Server Action 区别：
 * - Server Action 用 FormData（M8 之前给 <form action> 用）
 * - 这里用 typed args，更适合 JSON-RPC 工具调用
 * - delete 没有 formData 的"重命名"区别，所以 delete 逻辑直接复用
 *
 * 复用相同的业务逻辑（hasSpaceAccess / MAX_DEPTH / 重名校验）
 */

import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { locations, items } from "@/lib/db/schema"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import {
  CreateLocationSchema,
  DeleteLocationSchema,
} from "@/lib/validation/schemas"

type WriteResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

const MAX_DEPTH = 5

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

async function getSpaceOfLocation(locationId: number): Promise<number | null> {
  const [row] = await db
    .select({ spaceId: locations.spaceId })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1)
  return row?.spaceId ?? null
}

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

// ============================================================
// create_location
// ============================================================

export async function mcpCreateLocation(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = CreateLocationSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { spaceId, parentId, name, description } = parsed.data

  if (!(await hasSpaceAccess(userId, spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  if (parentId) {
    const parentDepth = await getDepth(parentId)
    if (parentDepth >= MAX_DEPTH) {
      return { ok: false, error: `位置层级最多 ${MAX_DEPTH} 级` }
    }
    const parentSpaceId = await getSpaceOfLocation(parentId)
    if (parentSpaceId !== spaceId) {
      return { ok: false, error: "父位置不在同一空间" }
    }
    const [sib] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.parentId, parentId), eq(locations.name, name)))
      .limit(1)
    if (sib) return { ok: false, error: "同一位置下已存在同名子位置" }
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
    if (sib) return { ok: false, error: "该空间根位置已存在同名" }
  }

  const [created] = await db
    .insert(locations)
    .values({
      spaceId,
      parentId: parentId ?? null,
      name,
      description: description || null,
    })
    .returning({ id: locations.id })

  return { ok: true, data: { id: created.id } }
}

// ============================================================
// update_location（partial update：只改传了的字段）
// ============================================================

const UpdateLocationMcpSchema = CreateLocationSchema.partial().extend({
  id: CreateLocationSchema.shape.spaceId, // 共用 z.coerce.number().int().positive()
})

export async function mcpUpdateLocation(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = UpdateLocationMcpSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" }
  }
  const { id, name, parentId, description, spaceId: _ignored } = parsed.data

  // 先查 item 的 spaceId 校验权限
  const currentSpaceId = await getSpaceOfLocation(id)
  if (!currentSpaceId) return { ok: false, error: "位置不存在" }
  if (!(await hasSpaceAccess(userId, currentSpaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  // 构造 patch
  const patch: Record<string, unknown> = {}
  if (name !== undefined) {
    // 重名校验（用 new parentId 或当前）
    const [sib] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, id),
          eq(locations.name, name)
        )
      )
      .limit(1)
    if (sib) return { ok: false, error: "同名位置已存在" }
    patch.name = name
  }
  if (description !== undefined) {
    patch.description = description || null
  }
  if (parentId !== undefined) {
    // parentId: null 表示移到根；数字表示移到某位置
    if (parentId === id) return { ok: false, error: "不能移到自身" }
    if (parentId !== null) {
      const parentSpaceId = await getSpaceOfLocation(parentId)
      if (parentSpaceId !== currentSpaceId) {
        return { ok: false, error: "父位置不在同一空间" }
      }
      if (await isDescendant(id, parentId)) {
        return { ok: false, error: "不能移到自己的子位置" }
      }
      const parentDepth = await getDepth(parentId)
      const newDepth = parentDepth + 1
      if (newDepth > MAX_DEPTH) {
        return { ok: false, error: `位置层级最多 ${MAX_DEPTH} 级` }
      }
    }
    patch.parentId = parentId
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { id } } // no-op
  }

  await db.update(locations).set(patch).where(eq(locations.id, id))
  return { ok: true, data: { id } }
}

// ============================================================
// delete_location
// ============================================================

export async function mcpDeleteLocation(
  userId: number,
  raw: unknown
): Promise<WriteResult<{ id: number }>> {
  const parsed = DeleteLocationSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "参数错误" }
  const { id } = parsed.data

  const spaceId = await getSpaceOfLocation(id)
  if (!spaceId) return { ok: false, error: "位置不存在" }
  if (!(await hasSpaceAccess(userId, spaceId, "editor"))) {
    return { ok: false, error: "无权操作该空间" }
  }

  // FK onDelete: cascade 处理子位置和 items.locationId
  await db.delete(locations).where(eq(locations.id, id))
  return { ok: true, data: { id } }
}