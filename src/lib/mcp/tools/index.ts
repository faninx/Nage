/**
 * 注册所有 MCP 工具到给定 McpServer 实例。
 * M8.1 = 5 个读工具；M8.2 = 3 个写工具（editor scope）。
 */

import "server-only"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  GetItemTool,
  ListCategoriesTool,
  ListLocationsTool,
  ListSpacesTool,
  ListTagsTool,
  SearchItemsTool,
} from "./read"
import {
  CreateItemTool,
  CreateLocationTool,
  DeleteItemTool,
  DeleteLocationTool,
  UpdateItemTool,
  UpdateLocationTool,
} from "./write"

export function registerReadTools(server: McpServer): void {
  for (const tool of [
    ListSpacesTool,
    ListLocationsTool,
    ListCategoriesTool,
    ListTagsTool,
    SearchItemsTool,
    GetItemTool,
    CreateItemTool,
    UpdateItemTool,
    DeleteItemTool,
    CreateLocationTool,
    UpdateLocationTool,
    DeleteLocationTool,
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