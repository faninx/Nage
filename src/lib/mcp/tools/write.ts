/**
 * MCP 写工具（M8.2+）。
 *
 * 设计：
 * - 复用 mcp-auth + hasSpaceAccess 做权限；额外检查 caller scope === "editor"
 * - 复用 src/lib/mcp/items-actions.ts 的 typed write functions
 * - 输入用 MCP 专用的 zod schema（不用 src/lib/validation 里的 Server Action schema，
 *   因为那些 schema 含 z.coerce.date() / FormData preprocess 等，zod-to-json-schema
 *   翻译给 MCP JSON Schema 时会报 "Date cannot be represented"）
 * - expiredAt 用 ISO 字符串，内部转 Date 再传给底层 action
 * - 输出统一 ok/error 结构（让 caller 能拿到新建/更新/删除后的 id）
 */

import "server-only"
import { z } from "zod"
import { currentMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR, rpcError } from "@/lib/mcp/errors"
import {
  mcpCreateItem,
  mcpDeleteItem,
  mcpUpdateItem,
} from "@/lib/mcp/items-actions"
import {
  mcpCreateLocation,
  mcpDeleteLocation,
  mcpUpdateLocation,
} from "@/lib/mcp/locations-actions"
import {
  mcpCreateCategory,
  mcpDeleteCategory,
  mcpUpdateCategory,
} from "@/lib/mcp/categories-actions"
import {
  mcpCreateTag,
  mcpDeleteTag,
  mcpUpdateTag,
} from "@/lib/mcp/tags-actions"

type McpToolResult = {
  content: [{ type: "text"; text: string }]
  isError?: boolean
}

const ok = (data: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
})
const fail = (e: ReturnType<typeof rpcError>): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(e) }],
  isError: true,
})

/** 解析 ISO 8601 日期字符串；空 / null / undefined → null；其他抛错 */
function parseIsoDate(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return v
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v)
    if (isNaN(d.getTime())) throw new Error(`invalid date: ${v}`)
    return d
  }
  throw new Error(`invalid date type: ${typeof v}`)
}

/** caller 必须 editor scope */
function requireEditor():
  | { ok: true; userId: number }
  | { ok: false; error: ReturnType<typeof rpcError> } {
  const auth = currentMcpAuth()
  if (!auth) return { ok: false, error: rpcError(null, RPC_ERROR.unauth) }
  if (auth.scope !== "editor") {
    return { ok: false, error: rpcError(null, RPC_ERROR.insufficientScope) }
  }
  return { ok: true, userId: auth.userId }
}

// ============================================================
// create_item — MCP 专用 schema（避免 z.coerce.date）
// ============================================================

const CreateItemMcpSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  unit: z.string().max(20).optional(),
  price: z.coerce.number().nonnegative().multipleOf(0.01).max(99999999.99).nullable().optional(),
  tagIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  expiredAt: z.string().optional(), // ISO 8601
})

export const CreateItemTool = {
  name: "create_item",
  description:
    "Create a new item in a space. Requires editor scope. Returns {id} on success.",
  inputSchema: CreateItemMcpSchema,
  handler: async (args: z.infer<typeof CreateItemMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    let expiredAt: Date | null
    try {
      expiredAt = parseIsoDate(args.expiredAt)
    } catch (e) {
      return fail(rpcError(null, { code: -32602, message: e instanceof Error ? e.message : "expiredAt 格式错误" }))
    }
    const result = await mcpCreateItem(guard.userId, {
      spaceId: args.spaceId,
      name: args.name,
      description: args.description,
      categoryId: args.categoryId ?? null,
      locationId: args.locationId ?? null,
      quantity: args.quantity,
      unit: args.unit,
      price: args.price ?? null,
      tagIds: args.tagIds ?? [],
      expiredAt,
    })
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

// ============================================================
// update_item
// ============================================================

const UpdateItemMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  unit: z.string().max(20).nullable().optional(),
  price: z.coerce.number().nonnegative().multipleOf(0.01).max(99999999.99).nullable().optional(),
  tagIds: z.array(z.coerce.number().int().positive()).nullable().optional(),
  expiredAt: z.string().nullable().optional(),
})

export const UpdateItemTool = {
  name: "update_item",
  description:
    "Partial update an item by id. Only fields provided are changed. Pass null to clear categoryId/locationId/expiredAt/description/unit. Pass [] to clear tagIds. Requires editor scope.",
  inputSchema: UpdateItemMcpSchema,
  handler: async (args: z.infer<typeof UpdateItemMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    // 透传原始 args（保留 "key 是否传了" 的语义）
    const result = await mcpUpdateItem(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

// ============================================================
// delete_item
// ============================================================

const DeleteItemMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const DeleteItemTool = {
  name: "delete_item",
  description:
    "Delete an item by id (and its image records). Requires editor scope. Returns {id} on success. This is irreversible.",
  inputSchema: DeleteItemMcpSchema,
  handler: async (args: z.infer<typeof DeleteItemMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpDeleteItem(guard.userId, { id: args.id })
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

// ============================================================
// create_location / update_location / delete_location（M9.2）
// ============================================================

const CreateLocationMcpSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().max(1000).optional(),
})

export const CreateLocationTool = {
  name: "create_location",
  description:
    "Create a location in a space. Requires editor scope. parentId optional (omit = root). Returns {id} on success.",
  inputSchema: CreateLocationMcpSchema,
  handler: async (args: z.infer<typeof CreateLocationMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpCreateLocation(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const UpdateLocationMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  parentId: z.coerce.number().int().positive().nullable().optional(), // null = move to root
  description: z.string().max(1000).optional(),
})

export const UpdateLocationTool = {
  name: "update_location",
  description:
    "Partial update a location by id. Only fields provided are changed. parentId null = move to root. Requires editor scope.",
  inputSchema: UpdateLocationMcpSchema,
  handler: async (args: z.infer<typeof UpdateLocationMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpUpdateLocation(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const DeleteLocationMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const DeleteLocationTool = {
  name: "delete_location",
  description:
    "Delete a location by id. Cascades to sub-locations and clears items.locationId (FK CASCADE). Requires editor scope.",
  inputSchema: DeleteLocationMcpSchema,
  handler: async (args: z.infer<typeof DeleteLocationMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpDeleteLocation(guard.userId, { id: args.id })
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

// ============================================================
// create_category / update_category / delete_category（M9.3）
// ============================================================

const CreateCategoryMcpSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  icon: z.string().max(20).optional(),
})

export const CreateCategoryTool = {
  name: "create_category",
  description:
    "Create a category in a space. icon optional (single emoji recommended). Requires editor scope. Returns {id} on success.",
  inputSchema: CreateCategoryMcpSchema,
  handler: async (args: z.infer<typeof CreateCategoryMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpCreateCategory(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const UpdateCategoryMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  icon: z.string().max(20).optional(),
})

export const UpdateCategoryTool = {
  name: "update_category",
  description:
    "Partial update a category. Only provided fields are changed. Requires editor scope.",
  inputSchema: UpdateCategoryMcpSchema,
  handler: async (args: z.infer<typeof UpdateCategoryMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpUpdateCategory(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const DeleteCategoryMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const DeleteCategoryTool = {
  name: "delete_category",
  description:
    "Delete a category. Items in this category have categoryId set to null (FK ON DELETE SET NULL). Requires editor scope.",
  inputSchema: DeleteCategoryMcpSchema,
  handler: async (args: z.infer<typeof DeleteCategoryMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpDeleteCategory(guard.userId, { id: args.id })
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

// ============================================================
// create_tag / update_tag / delete_tag（M9.4）
// ============================================================

const CreateTagMcpSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  color: z.string().max(20).optional(),
})

export const CreateTagTool = {
  name: "create_tag",
  description:
    "Create a tag in a space. color optional (hex). Requires editor scope. Returns {id} on success.",
  inputSchema: CreateTagMcpSchema,
  handler: async (args: z.infer<typeof CreateTagMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpCreateTag(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const UpdateTagMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  color: z.string().max(20).optional(),
})

export const UpdateTagTool = {
  name: "update_tag",
  description: "Partial update a tag. Only provided fields are changed. Requires editor scope.",
  inputSchema: UpdateTagMcpSchema,
  handler: async (args: z.infer<typeof UpdateTagMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpUpdateTag(guard.userId, args)
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}

const DeleteTagMcpSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const DeleteTagTool = {
  name: "delete_tag",
  description:
    "Delete a tag. Items lose this tag association (item_tags FK CASCADE). Requires editor scope.",
  inputSchema: DeleteTagMcpSchema,
  handler: async (args: z.infer<typeof DeleteTagMcpSchema>): Promise<McpToolResult> => {
    const guard = requireEditor()
    if (!guard.ok) return fail(guard.error)
    const result = await mcpDeleteTag(guard.userId, { id: args.id })
    if (!result.ok) return fail(rpcError(null, { code: -32603, message: result.error }))
    return ok(result.data)
  },
}