/**
 * MCP 双轨鉴权解析器。
 *
 * 优先级：
 * 1. Authorization: Bearer nage_mcp_<43 chars>
 *    → 解析 secret → SHA-256 → 查 mcp_tokens 表 → fire-and-forget 更新 last_used_at
 * 2. 退回 nage_session cookie → 复用 getSession()
 *
 * 设计取舍：
 * - **不用 bcrypt**：256-bit 随机 token 哈希后用 indexed unique 查找已够；bcrypt cost 12 每 token ~250ms
 *   会让 AI agent 高频工具调用（每次 prompt = 多次往返）非常慢
 * - **不用 prefix 索引**：UNIQUE INDEX 列上直接查 hash 已是 O(log n)；prefix 会泄露部分匹配信息
 *   且需要更复杂的查询
 * - **Authorization 存在但不合法 → 不 fallback cookie**：用户明确带了坏 token 就当失败，不该
 *   偷偷用 cookie 鉴权绕过（攻击面更小）
 *
 * 返回 null 即表示"未通过鉴权"，调用方负责转 JSON-RPC -32000 + HTTP 401。
 */

import "server-only"
import { createHash } from "node:crypto"
import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { mcpTokens } from "@/lib/db/schema"
import { getSession } from "./session"

const BEARER_PREFIX = "nage_mcp_"
const SECRET_LEN = 43 // base64url(32 bytes) unpadded

export type McpAuth =
  | { userId: number; source: "cookie" }
  | { userId: number; source: "bearer"; tokenId: number }
  | null

export async function resolveMcpAuth(req: NextRequest): Promise<McpAuth> {
  const authz = req.headers.get("authorization")
  if (authz?.startsWith("Bearer ")) {
    const raw = authz.slice("Bearer ".length).trim()
    if (raw.startsWith(BEARER_PREFIX) && raw.length === BEARER_PREFIX.length + SECRET_LEN) {
      const secret = raw.slice(BEARER_PREFIX.length)
      const hash = createHash("sha256").update(secret).digest("hex")
      const [row] = await db
        .select({ id: mcpTokens.id, userId: mcpTokens.userId })
        .from(mcpTokens)
        .where(eq(mcpTokens.tokenHash, hash))
        .limit(1)
      if (row) {
        // fire-and-forget 更新 last_used_at；失败不影响本次请求
        void db
          .update(mcpTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(mcpTokens.id, row.id))
          .catch(() => {})
        return { userId: row.userId, source: "bearer", tokenId: row.id }
      }
    }
    // Authorization 存在但格式错 / token 不存在 → 不再 fallback（明确意图）
    return null
  }
  const s = await getSession()
  return s ? { userId: s.user.id, source: "cookie" } : null
}