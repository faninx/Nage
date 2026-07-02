/**
 * MCP per-token 速率限制（in-memory token bucket / sliding window）。
 *
 * **设计取舍**：
 * - **In-memory**：单进程 ok；多 worker 时每个 worker 独立计数（实际速率 = limit × workers）
 *   多 worker 部署要切到 Redis 等共享存储，留 M8.5+ 再做
 * - **Sliding window**：用时间戳数组实现，比固定窗口更精确
 * - **Key 维度**：用 `source:userId:tokenId`（Bearer）或 `source:userId`（cookie）
 *   同一用户用 cookie 调 60 次 + 用不同 token 调 60 次，rate 是独立的（避免一个 token
 *   拖累其他）
 *
 * 配置：环境变量 `MCP_RATE_LIMIT_PER_MIN`（默认 60）
 *
 * 不带 "server-only" guard（E2E 脚本需要 import _resetRateLimitForTest；路由层仍是 server-only）
 */

import type { McpAuth } from "@/lib/auth/mcp-auth"

/** 内存中的滑动窗口：key → 该 key 最近的请求时间戳（秒） */
const windows = new Map<string, number[]>()

const WINDOW_SEC = 60
const DEFAULT_LIMIT = 60

function getLimit(): number {
  // 测试覆盖值（跨进程无法用 env var；E2E 通过 _setLimitForTest 改）
  if (_limitOverride !== null) return _limitOverride
  const raw = process.env.MCP_RATE_LIMIT_PER_MIN
  if (!raw) return DEFAULT_LIMIT
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return n
}

let _limitOverride: number | null = null

function getKey(auth: NonNullable<McpAuth>): string {
  if (auth.source === "bearer") {
    return `bearer:${auth.userId}:${auth.tokenId}`
  }
  return `cookie:${auth.userId}`
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number }

/**
 * 记一次请求；返回是否通过 + 剩余配额。
 * 不通过的请求不计入窗口（避免越限越堆）。
 */
export function checkRateLimit(auth: NonNullable<McpAuth>, nowSec = Math.floor(Date.now() / 1000)): RateLimitResult {
  const limit = getLimit()
  const key = getKey(auth)
  const cutoff = nowSec - WINDOW_SEC

  // 拿到现有时间戳列表，过滤掉窗口外的
  let stamps = windows.get(key) ?? []
  stamps = stamps.filter((t) => t > cutoff)

  if (stamps.length >= limit) {
    // 最旧的时间戳 + WINDOW_SEC 之后才能再发
    const retryAfterSec = Math.max(1, stamps[0] + WINDOW_SEC - nowSec)
    windows.set(key, stamps) // 保存清理后的列表
    return { allowed: false, retryAfterSec }
  }

  stamps.push(nowSec)
  windows.set(key, stamps)
  return { allowed: true, remaining: limit - stamps.length }
}

/** 单元测试 / E2E 用：清空所有计数 */
export function _resetRateLimitForTest(): void {
  windows.clear()
}

/** 单元测试 / E2E 用：覆盖默认 limit（注意：跨进程时 dev server 进程用的是另一份 module） */
export function _setLimitForTest(n: number | null): void {
  _limitOverride = n
}

/** 单元测试 / E2E 用：查某 key 当前窗口内计数 */
export function _getCountForTest(key: string): number {
  const nowSec = Math.floor(Date.now() / 1000)
  const cutoff = nowSec - WINDOW_SEC
  const stamps = windows.get(key) ?? []
  return stamps.filter((t) => t > cutoff).length
}