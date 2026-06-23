import "server-only"
import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  spaces,
  spaceMembers,
  users,
  type SpaceRole,
  spaceRoleAtLeast,
} from "@/lib/db/schema"
import { defaultSpaceName } from "@/lib/actions/types"
import { seedSpaceDefaults } from "@/lib/db/seed-space-defaults"

/**
 * 空间级 ACL 服务。
 * - viewer: 读
 * - editor: 读 + 增删改物品/位置/分类/标签
 * - owner:  + 改空间名/删除空间/管理成员
 *
 * 数据迁移保证：每个老空间在 v1.1 起都有一行 owner（其 ownerId），
 * 所以「成员」与「非成员」二分就退化为「有 row vs 没 row」。
 */

/** 查用户在某空间的角色。无访问权限返回 null。 */
export async function getUserSpaceRole(
  userId: number,
  spaceId: number
): Promise<SpaceRole | null> {
  const [row] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1)
  return row?.role ?? null
}

/** 是否有 >= minRole 权限。 */
export async function hasSpaceAccess(
  userId: number,
  spaceId: number,
  minRole: SpaceRole = "viewer"
): Promise<boolean> {
  const role = await getUserSpaceRole(userId, spaceId)
  return role != null && spaceRoleAtLeast(role, minRole)
}

/** 列出 user 全部可访问的空间（含角色）。 */
export async function listAccessibleSpaces(
  userId: number
): Promise<{ id: number; name: string; role: SpaceRole; isOwner: boolean }[]> {
  const rows = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      role: spaceMembers.role,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(asc(spaces.id))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    isOwner: r.role === "owner",
  }))
}

/**
 * 取 user 的"当前空间" id：
 * 1) users.lastSpaceId（如果 user 仍有访问权）
 * 2) fallback: 该用户最早创建的空间（一定是 owner 角色）
 * 3) 兜底：建一个默认空间（owner）并选中
 *
 * 不返回 null——保证调用方总有 spaceId。
 */
export async function getCurrentSpaceId(userId: number): Promise<number> {
  const [u] = await db
    .select({ lastSpaceId: users.lastSpaceId, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (u?.lastSpaceId != null) {
    const ok = await hasSpaceAccess(userId, u.lastSpaceId, "viewer")
    if (ok) return u.lastSpaceId
  }
  // fallback: 最先创建的访问空间
  const accessible = await listAccessibleSpaces(userId)
  if (accessible.length > 0) {
    const pick = accessible[0].id
    await setCurrentSpaceId(userId, pick)
    return pick
  }
  // 兜底：建一个默认空间（用户作为 owner，名字 = "${昵称}的空间"）
  const id = await ensureDefaultSpace({
    id: userId,
    nickname: u?.nickname ?? "用户",
  })
  return id
}

/** 把 user 的 lastSpaceId 设成指定空间（要求有访问权，否则不动）。 */
export async function setCurrentSpaceId(userId: number, spaceId: number): Promise<void> {
  const ok = await hasSpaceAccess(userId, spaceId, "viewer")
  if (!ok) return
  await db.update(users).set({ lastSpaceId: spaceId }).where(eq(users.id, userId))
}

/** 用户首次进入系统时自动建默认空间 + 给 owner 加 member 行。幂等。 */
export async function ensureDefaultSpace(user: {
  id: number
  nickname: string
}): Promise<number> {
  const name = defaultSpaceName(user.nickname)
  const existing = await db
    .select()
    .from(spaces)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
    .where(
      and(
        eq(spaces.ownerId, user.id),
        eq(spaceMembers.userId, user.id),
        eq(spaces.name, name)
      )
    )
    .limit(1)
  if (existing.length > 0) {
    const id = existing[0].spaces.id
    // 顺便把 lastSpaceId 也对齐到这个默认空间（首次进入时是 NULL）
    await setCurrentSpaceId(user.id, id)
    return id
  }

  // 不存在 → insert + 写 member(owner) + 种入通用位置/分类
  const [created] = await db
    .insert(spaces)
    .values({ name, ownerId: user.id })
    .returning({ id: spaces.id })
  await db.insert(spaceMembers).values({
    spaceId: created.id,
    userId: user.id,
    role: "owner",
  })
  await seedSpaceDefaults(created.id)
  await setCurrentSpaceId(user.id, created.id)
  return created.id
}
