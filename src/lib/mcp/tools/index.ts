/**
 * 注册所有 MCP 读工具到给定 McpServer 实例。
 * 写工具在 M8.2+ 加。
 */

import "server-only"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  GetItemTool,
  ListCategoriesTool,
  ListLocationsTool,
  ListTagsTool,
  SearchItemsTool,
} from "./read"

export function registerReadTools(server: McpServer): void {
  for (const tool of [
    ListLocationsTool,
    ListCategoriesTool,
    ListTagsTool,
    SearchItemsTool,
    GetItemTool,
  ]) {
    // McpServer.registerTool 第 3 参数是 handler；
    // SDK 内部会拿 inputSchema 做 zod safeParse，handler 收到已 parse 的 args
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool.handler as any
    )
  }
}