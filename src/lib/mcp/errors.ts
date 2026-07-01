/**
 * JSON-RPC 2.0 错误码常量 + 工具函数。
 *
 * 设计原则：
 * - 标准错误码（-32700 ~ -32603）沿用 JSON-RPC 2.0 规范
 * - 自定义错误码用 -320xx 区间（MCP 生态惯例）：
 *   - -32000 = 未认证（缺 cookie 或 token 不对）
 *   - -32001 = 已认证但无空间权限
 *
 * "use server" 文件不能 export 非 async 函数，但这个文件不带 "use server"
 * directive，所以类型 / 常量 / 同步函数都能 export。
 */

export const RPC_ERROR = {
  parse: { code: -32700, message: "Parse error" },
  invalidReq: { code: -32600, message: "Invalid Request" },
  methodNot: { code: -32601, message: "Method not found" },
  invalidArgs: { code: -32602, message: "Invalid params" },
  internal: { code: -32603, message: "Internal error" },
  unauth: {
    code: -32000,
    message:
      "未认证：请提供 nage_session cookie 或 Authorization: Bearer nage_mcp_<token>",
  },
  forbidden: { code: -32001, message: "无权访问该空间" },
} as const

export type RpcErrorDef = (typeof RPC_ERROR)[keyof typeof RPC_ERROR]

export type JsonRpcError = { code: number; message: string; data?: unknown }

/**
 * 构造一个 JSON-RPC error 响应对象。
 * @param id  对端请求的 id（如果请求不合法可以是 null）
 * @param e   错误定义（来自 RPC_ERROR）
 * @param data 可选，附加诊断信息（如 zod issues）
 */
export function rpcError(
  id: unknown,
  e: RpcErrorDef,
  data?: unknown
): { jsonrpc: "2.0"; id: unknown; error: JsonRpcError } {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: e.code,
      message: e.message,
      ...(data !== undefined ? { data } : {}),
    },
  }
}

/**
 * 把 zod safeParse 失败转成 JSON-RPC -32602 数据。
 * 只取前 5 条 issues 避免响应过大。
 */
export function zodToRpcIssues(
  error: import("zod").ZodError
): { code: -32602; message: string; data: unknown } {
  return {
    code: -32602,
    message: "Invalid params",
    data: { issues: error.issues.slice(0, 5) },
  }
}