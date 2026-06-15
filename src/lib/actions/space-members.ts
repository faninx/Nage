"use server"

import { revalidatePath } from "next/cache"
import { eq, and, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, spaceMembers } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { z } from "zod"
import { SPACE_ROLES } from "@/lib/db/schema"
import type { ActionState } from "./types"

// ============================================================
// 校验 schema
// ============================================================
const SpaceId = z.coerce.number().int().positive()
const UserId = z.coerce.number().int().positive()
const Role = z.enum(SPACE_ROLES)

const InviteMemberSchema = z.object({
  spaceId: SpaceId,
  username: z.string().min(1).max(32),
  role: Role.default("editor"),
})

const ChangeRoleSchema = z.object({
  spaceId: SpaceId,
  userId: UserId,
  role: Role,
})

const RemoveMemberSchema = z.object({
  spaceId: SpaceId,
  userId: UserId,
})

const SearchUsersSchema = z.object({
  spaceId: SpaceId,
  q: z.string().min(1).max(32),
})

// ============================================================
// 搜用户（owner 在空间设置里加成员用，限定 prefix 匹配、active=true）
// ============================================================
export async function searchUsersAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState & { data?: { id: number; username: string; nickname: string }[] }> {
  const user = await requireSession()
  const parsed = SearchUsersSchema.safeParse({
    spaceId: formData.get("spaceId"),
    q: formData.get("q"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, q } = parsed.data
  if (!(await hasSpaceAccess(user.id, spaceId, "owner"))) {
    return { error: "无权操作" }
  }

  // 两个查询互不依赖，并行
  const [rows, members] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, nickname: users.nickname })
      .from(users)
      .where(and(eq(users.isActive, true), like(users.username, `${q}%`)))
      .limit(8),
    db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, spaceId)),
  ])
  // 排除已经是成员的人
  const memberIds = new Set(members.map((r) => r.userId))
  return {
    ok: true,
    data: rows
      .filter((r) => !memberIds.has(r.id))
      .map((r) => ({ id: r.id, username: r.username, nickname: r.nickname })),
  }
}

// ============================================================
// 邀请（按 username 搜到后插 member）
// ============================================================
export async function inviteMemberAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireSession()
  const parsed = InviteMemberSchema.safeParse({
    spaceId: formData.get("spaceId"),
    username: formData.get("username"),
    role: formData.get("role") || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, username, role } = parsed.data

  if (!(await hasSpaceAccess(me.id, spaceId, "owner"))) return { error: "无权操作" }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (!target) return { error: "用户不存在" }
  if (!target.isActive) return { error: "该用户已停用" }

  // 已存在 → 提示不报错
  const [existing] = await db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, target.id)))
    .limit(1)
  if (existing) return { error: "该用户已是空间成员" }

  await db.insert(spaceMembers).values({ spaceId, userId: target.id, role })
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { ok: true }
}

// ============================================================
// 改角色
// ============================================================
export async function changeMemberRoleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireSession()
  const parsed = ChangeRoleSchema.safeParse({
    spaceId: formData.get("spaceId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, userId, role } = parsed.data

  if (!(await hasSpaceAccess(me.id, spaceId, "owner"))) return { error: "无权操作" }
  if (userId === me.id && role !== "owner") {
    return { error: "不能把自己的角色降级（会失去所有权）" }
  }

  // 至少保留 1 个 owner
  if (role !== "owner") {
    const owners = await db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, "owner")))
    if (owners.length <= 1 && owners[0]?.userId === userId) {
      return { error: "至少保留一个空间所有者" }
    }
  }

  await db
    .update(spaceMembers)
    .set({ role })
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { ok: true }
}

// ============================================================
// 移除成员
// ============================================================
export async function removeMemberAction(formData: FormData): Promise<ActionState> {
  const me = await requireSession()
  const parsed = RemoveMemberSchema.safeParse({
    spaceId: formData.get("spaceId"),
    userId: formData.get("userId"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  const { spaceId, userId } = parsed.data

  if (!(await hasSpaceAccess(me.id, spaceId, "owner"))) return { error: "无权操作" }
  if (userId === me.id) return { error: "不能把自己移出（先转让所有权）" }

  // 至少保留 1 个 owner
  const [target] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1)
  if (!target) return { error: "该用户不在此空间" }
  if (target.role === "owner") {
    const owners = await db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, "owner")))
    if (owners.length <= 1) {
      return { error: "至少保留一个空间所有者" }
    }
  }

  await db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
  // 如果该用户当前选中的就是这个空间，清掉 lastSpaceId（让下次 getCurrentSpaceId 重新挑一个）
  await db
    .update(users)
    .set({ lastSpaceId: null })
    .where(and(eq(users.id, userId), eq(users.lastSpaceId, spaceId)))
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { ok: true }
}
