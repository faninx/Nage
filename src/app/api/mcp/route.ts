/**
 * MCP Server Streamable HTTP endpoint (POST /api/mcp).
 *
 * 设计要点：
 * - runtime = "nodejs"：better-sqlite3 + node:crypto 都需要 Node runtime（Edge 跑不了）
 * - 单 transport 实例：M8.1 全 stateless，无需 sessionIdGenerator
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
import { getMcpServer } from "@/lib/mcp/server"
import { resolveMcpAuth } from "@/lib/auth/mcp-auth"
import { setCurrentMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR } from "@/lib/mcp/errors"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// 单 transport 实例（stateless 模式共享一个 OK，因为 M8.1 全 stateless + 单进程）
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
  enableJsonResponse: true,
})

let _initialized = false
function ensureInitialized() {
  if (_initialized) return
  const server = getMcpServer()
  transport
    .start()
    .then(() => server.connect(transport))
    .catch((e) => console.error("[mcp] transport init failed", e))
  _initialized = true
}

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
  ensureInitialized()

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

  // 把鉴权结果注入 context，工具 handler 通过 currentMcpAuth() 取
  setCurrentMcpAuth(auth)
  try {
    return await transport.handleRequest(req)
  } finally {
    setCurrentMcpAuth(null)
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