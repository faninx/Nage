"use server"

/**
 * MCP Bearer 令牌的 Server Actions（CRUD）。
 *
 * - createMcpTokenAction：生成 256-bit 随机 token（base64url），存 SHA-256 hash，
 *   **明文 token 只在创建响应里返回一次**（之后无法再次查看）
 * - revokeMcpTokenAction：硬删除（加 WHERE user_id = me.id 二次校验防越权）
 * - listMcpTokensAction：返回当前用户的所有 token（不含 hash）
 */

import { createHash, randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { mcpTokens } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import {
  CreateMcpTokenSchema,
  RevokeMcpTokenSchema,
} from "@/lib/validation/schemas"
import type { ActionState, McpTokenListItem } from "./types"

const TOKEN_PREFIX = "nage_mcp_"

export async function createMcpTokenAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState & { token?: string; tokenId?: number; lastFour?: string }> {
  const me = await requireSession()
  const parsed = CreateMcpTokenSchema.safeParse({
    name: formData.get("name"),
    scope: formData.get("scope") || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数错误" }
  }

  const secret = randomBytes(32).toString("base64url") // 43 chars
  const token = `${TOKEN_PREFIX}${secret}`
  const hash = createHash("sha256").update(secret).digest("hex")
  const lastFour = secret.slice(-4)

  const [row] = await db
    .insert(mcpTokens)
    .values({
      userId: me.id,
      name: parsed.data.name,
      tokenHash: hash,
      lastFour,
      scope: parsed.data.scope,
    })
    .returning({ id: mcpTokens.id })

  revalidatePath("/settings/mcp")
  return { ok: true, token, tokenId: row.id, lastFour }
}

export async function revokeMcpTokenAction(formData: FormData): Promise<ActionState> {
  const me = await requireSession()
  const parsed = RevokeMcpTokenSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }

  // 硬删除；用 RETURNING 拿 user_id 二次校验防越权
  const result = await db
    .delete(mcpTokens)
    .where(eq(mcpTokens.id, parsed.data.id))
    .returning({ userId: mcpTokens.userId })

  if (result.length === 0 || result[0].userId !== me.id) {
    return { error: "令牌不存在或无权操作" }
  }
  revalidatePath("/settings/mcp")
  return { ok: true }
}

export async function listMcpTokensAction(): Promise<McpTokenListItem[]> {
  const me = await requireSession()
  const rows = await db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      lastFour: mcpTokens.lastFour,
      scope: mcpTokens.scope,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, me.id))
    .orderBy(desc(mcpTokens.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastFour: r.lastFour,
    scope: r.scope,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
  }))
}