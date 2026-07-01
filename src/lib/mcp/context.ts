/**
 * MCP 工具调用期间的"当前调用者"上下文。
 *
 * 为什么用模块级变量而不是 AsyncLocalStorage：
 * - Next.js App Router 默认单进程（next start 不带 --workers 是 1 个 worker）
 * - Route Handler 串行处理每个请求
 * - Route Handler 内部 transport.handleRequest() 同步返回 Response 前，整个调用链都在同一个
 *   微任务上下文里 —— 模块级变量不会被并发污染
 *
 * M8.2 引入会话管理 / 多 worker 部署时，切到 AsyncLocalStorage。
 */

import "server-only"
import type { McpAuth } from "@/lib/auth/mcp-auth"

let _currentAuth: McpAuth = null

export function setCurrentMcpAuth(a: McpAuth): void {
  _currentAuth = a
}

export function currentMcpAuth(): McpAuth {
  return _currentAuth
}