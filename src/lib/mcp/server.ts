/**
 * McpServer 工厂。
 *
 * **注意：stateless 模式下必须每个请求新建 server + transport**（SDK 强制），
 * 因为：
 * - 一个 McpServer 同一时刻只能 connect 到一个 transport
 * - transport 处理完一个请求后内部标记 `_hasHandledRequest=true`，
 *   第二次 handleRequest 会抛 "Stateless transport cannot be reused across requests"
 *
 * 工具注册成本极低（只是存到 Map），不值得做 singleton 优化。
 */

import "server-only"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerReadTools } from "./tools/index"
import { registerResources } from "./resources"
import { registerPrompts } from "./prompts"

const SERVER_NAME = "nage"
const SERVER_VERSION = "1.2.1" // M8.1 仍跑 v1.2.1；下次发版 bump

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerReadTools(server)
  registerResources(server)
  registerPrompts(server)
  return server
}