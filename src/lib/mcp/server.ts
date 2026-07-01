/**
 * McpServer 单例。
 *
 * - 一个进程一个 server；M8.1 全 stateless，不需要 session
 * - 工具注册延后到 M8.1.4 的 registerReadTools()（避免循环 import 工具模块）
 *
 * 用法：
 *   import { getMcpServer } from "@/lib/mcp/server"
 *   const s = getMcpServer()  // 首次访问时创建
 */

import "server-only"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

let _server: McpServer | null = null

export function getMcpServer(): McpServer {
  if (_server) return _server
  _server = new McpServer({
    name: "nage",
    version: "1.2.1", // M8.1 仍跑 v1.2.1；下次发版 bump
  })
  return _server
}