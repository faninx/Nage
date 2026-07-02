/**
 * MCP 工具调用期间的"当前调用者"上下文。
 *
 * M8.5+：用 Node AsyncLocalStorage 跟踪每请求的 auth。
 * 取代之前的模块级变量 —— 因为开了 sessionIdGenerator 后 transport 内部会
 * 保留 session 状态（Map<sessionId, state>），并发请求的 session 状态互不污染
 * 是 SDK 的保证；但我们自己的 tool/resource/prompt callbacks 仍共享一个
 * 进程级 module state —— 必须用 ALS 隔离。
 *
 * 用法：route handler 在 setCurrentMcpAuth(auth) 后，调用 transport.handleRequest
 * ALS 上下文自动在所有 callback 链路里传递。
 */

import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import type { McpAuth } from "@/lib/auth/mcp-auth"

const als = new AsyncLocalStorage<McpAuth>()

/** 用 ALS 包裹 fn；执行期间 currentMcpAuth() 返回 auth；之后恢复 undefined */
export function runWithMcpAuth<T>(auth: McpAuth, fn: () => T): T {
  return als.run(auth, fn)
}

export function currentMcpAuth(): McpAuth {
  return als.getStore() ?? null
}