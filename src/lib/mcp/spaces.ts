/**
 * MCP 空间相关 read（list_spaces）。
 * 写操作暂无（M9 范围内：空间创建/删除/转让都不暴露给 MCP，限定在 Web UI）。
 */

import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { spaceMembers, spaces, users, type SpaceRole } from "@/lib/db/schema"
import { currentMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR, rpcError } from "@/lib/mcp/errors"

export type McpSpaceListItem = {
  id: number
  name: string
  role: SpaceRole
  isOwner: boolean
  ownerId: number
  ownerNickname: string
  memberCount: number
  createdAt: string // ISO
}

/** 当前 caller 有访问权的空间（含 role 和 owner 信息） */
export async function mcpListSpaces(): Promise<McpSpaceListItem[]> {
  const auth = currentMcpAuth()
  if (!auth) throw new Error(rpcError(null, RPC_ERROR.unauth).error.message)

  const rows = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      role: spaceMembers.role,
      isOwner: sql<number>`CASE WHEN ${spaces.ownerId} = ${auth.userId} THEN 1 ELSE 0 END`.as(
        "is_owner"
      ),
      ownerId: spaces.ownerId,
      ownerNickname: users.nickname,
      memberCount: sql<number>`(SELECT COUNT(*) FROM space_members WHERE space_members.space_id = ${spaces.id})`.as(
        "member_count"
      ),
      createdAt: spaces.createdAt,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .innerJoin(users, eq(spaces.ownerId, users.id))
    .where(eq(spaceMembers.userId, auth.userId))
    .orderBy(desc(spaces.createdAt))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    isOwner: r.isOwner === 1,
    ownerId: r.ownerId,
    ownerNickname: r.ownerNickname,
    memberCount: r.memberCount,
    createdAt: r.createdAt.toISOString(),
  }))
}
