/**
 * MCP Server Streamable HTTP endpoint (POST /api/mcp).
 *
 * 设计要点：
 * - runtime = "nodejs"：better-sqlite3 + node:crypto 都需要 Node runtime（Edge 跑不了）
 * - 每个请求新建 server + transport（SDK stateless 模式强制要求）
 *   - 一个 McpServer 同一时刻只能 connect 一个 transport
 *   - transport 第二次 handleRequest 会抛 "Stateless transport cannot be reused"
 * - enableJsonResponse: true：不开 SSE 流，所有响应直接 JSON
 * - Origin 校验：MCP spec 强制防 DNS rebinding
 *   - 无 Origin（CLI / SDK）→ 放行
 *   - dev: localhost / 127.0.0.1 任意端口放行
 *   - prod: 与 PUBLIC_URL 同源放行
 * - Auth：双轨（Bearer nage_mcp_* 优先，fallback nage_session cookie）
 *   - 失败 → JSON-RPC -32000 + HTTP 401
 *
 * GET / DELETE：M8.1 stateless 没意义，直接 405。
 */

import { NextRequest, NextResponse } from "next/server"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createMcpServer } from "@/lib/mcp/server"
import { resolveMcpAuth } from "@/lib/auth/mcp-auth"
import { runWithMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR, rpcError } from "@/lib/mcp/errors"
import { checkRateLimit } from "@/lib/mcp/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Origin 校验（防 DNS rebinding）
 */
function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return true // 非浏览器客户端（CLI / Claude Desktop bridge）通常不发 Origin

  if (process.env.NODE_ENV !== "production") {
    try {
      const u = new URL(origin)
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true
    } catch {
      // 解析失败 → 走 prod 路径
    }
  }

  const pub = process.env.PUBLIC_URL
  if (!pub) return false
  try {
    return new URL(origin).origin === new URL(pub).origin
  } catch {
    return false
  }
}

async function handle(req: NextRequest): Promise<Response> {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin 不被允许" }, { status: 403 })
  }

  const auth = await resolveMcpAuth(req)
  if (!auth) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC_ERROR.unauth.code, message: RPC_ERROR.unauth.message },
      },
      { status: 401 }
    )
  }

  // 速率限制（M8.3）：鉴权通过后才限流（未鉴权不算配额）
  const rl = checkRateLimit(auth)
  if (!rl.allowed) {
    // 解析 body 拿 id + method（限流响应需要正确 id；tools/call 的错误得是 result 形式）
    let reqId: unknown = null
    let reqMethod: string | null = null
    try {
      const text = await req.clone().text()
      const parsed = JSON.parse(text)
      reqId = parsed.id ?? null
      reqMethod = typeof parsed.method === "string" ? parsed.method : null
    } catch {
      // ignore
    }
    const errMsg = `${RPC_ERROR.rateLimited.message}（${rl.retryAfterSec} 秒后重试）`
    const headers = { "Retry-After": String(rl.retryAfterSec) }
    if (reqMethod === "tools/call") {
      // tool call 错误必须装在 result 里（SDK 不认 top-level error）
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: reqId,
          result: {
            content: [{ type: "text", text: errMsg }],
            isError: true,
          },
        },
        { status: 200, headers }
      )
    }
    // 协议级 error（initialize / tools/list / notifications 等）
    return NextResponse.json(rpcError(reqId, RPC_ERROR.rateLimited, errMsg), {
      status: 200,
      headers,
    })
  }

  // 每个请求新建 server + transport（stateless 强制）
  //
  // M8.5 决策：暂不开启 sessionIdGenerator。
  // - 开 session 模式需要 transport 跨请求存活（否则 SDK Client 第二次请求报
  //   "Server not initialized"），需要 Map<sessionId, transport> 缓存，复杂度上升
  // - Nage 现状没有 server-initiated 消息 / 资源订阅等需要 session 的高级能力
  // - 后续真要开（如 server-sent notifications 给 MCP client 主动推过期提醒），
  //   再加 transport 缓存 + `sessionIdGenerator: () => randomUUID()`
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    // 用 AsyncLocalStorage 包住 handleRequest；tool/resource/prompt callback 在 ALS 上下文里跑
    return await runWithMcpAuth(auth, () => transport.handleRequest(req))
  } finally {
    try {
      await transport.close()
    } catch {
      // ignore close errors
    }
    try {
      await server.close()
    } catch {
      // ignore close errors
    }
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req)
}

export async function GET(): Promise<Response> {
  return new NextResponse("Method Not Allowed", { status: 405 })
}

export async function DELETE(): Promise<Response> {
  return new NextResponse("Method Not Allowed", { status: 405 })
}