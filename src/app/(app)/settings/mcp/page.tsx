import { requireSession } from "@/lib/auth/session"
import { listMcpTokensAction } from "@/lib/actions/mcp-tokens"
import { McpTokensClient } from "./mcp-tokens-client"
import { KeyRound } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function McpSettingsPage() {
  // requireSession：跟现有 settings 页面一致；proxy.ts 已放过本路径
  const user = await requireSession()
  const tokens = await listMcpTokensAction()

  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "")
  const endpoint = `${publicUrl ?? "(未配置 PUBLIC_URL)"}/api/mcp`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-5" />
        <h1 className="text-xl font-semibold">MCP 令牌</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        为 AI 客户端（Claude Desktop、Cursor、Cline 等）生成 Bearer 令牌。
        每个令牌独立可吊销，对应你的全部空间访问权限。
      </p>

      <div className="rounded-md border bg-card p-3 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">服务端点：</span>
          <code className="font-mono text-xs">/api/mcp</code>
        </div>
        <div>
          <span className="text-muted-foreground">完整 URL：</span>
          <code className="font-mono text-xs">{endpoint}</code>
        </div>
        <div className="text-xs text-muted-foreground pt-1">
          鉴权方式：<code className="font-mono">Authorization: Bearer nage_mcp_&lt;43 chars&gt;</code>
        </div>
      </div>

      <McpTokensClient initial={tokens} />

      <div className="text-xs text-muted-foreground">
        登录用户：<span className="font-medium">{user.nickname}</span>
      </div>
    </div>
  )
}