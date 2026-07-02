/**
 * MCP 读工具实现（M8.1 只读 MVP）。
 *
 * 设计原则：
 * - 全部沿用现有 service 层（src/lib/db/items-query.ts 等），不重写业务逻辑
 * - 鉴权用 currentMcpAuth() + hasSpaceAccess(uid, sid, "viewer")
 * - 输出统一 JSON text（MCP 工具规范）；返回 isError 区分成功 / 失败
 * - list_locations 在服务端 buildTree（locations-client.tsx 的 React 部分不能直接复用）
 */

import "server-only"
import { z } from "zod"
import { eq, sql, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, itemTags, items, locations, tags } from "@/lib/db/schema"
import { queryItems, queryItemById, expandLocationIds } from "@/lib/db/items-query"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { currentMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR, rpcError } from "@/lib/mcp/errors"
import { mcpListSpaces } from "@/lib/mcp/spaces"

type McpToolResult = {
  content: [{ type: "text"; text: string }]
  isError?: boolean
}

/** 工具内部统一的空间权限检查 + 用户 id 提取 */
async function checkSpaceAccess(
  spaceId: number,
  minRole: "viewer" | "editor" | "owner" = "viewer"
): Promise<
  | { ok: true; userId: number }
  | { ok: false; error: ReturnType<typeof rpcError> }
> {
  const auth = currentMcpAuth()
  if (!auth) return { ok: false, error: rpcError(null, RPC_ERROR.unauth) }
  const ok = await hasSpaceAccess(auth.userId, spaceId, minRole)
  if (!ok) return { ok: false, error: rpcError(null, RPC_ERROR.forbidden) }
  return { ok: true, userId: auth.userId }
}

const ok = (data: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
})
const fail = (e: ReturnType<typeof rpcError>): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(e) }],
  isError: true,
})

// ============================================================
// list_spaces（M9.1）— 列出 caller 有访问权的所有空间
// ============================================================

const ListSpacesInput = z.object({}).strict() // 不需要任何入参

export const ListSpacesTool = {
  name: "list_spaces",
  description:
    "List all spaces the caller has access to (with their role, owner, member count). Solves the spaceId chicken-and-egg problem for Bearer auth.",
  inputSchema: ListSpacesInput,
  handler: async (): Promise<McpToolResult> => {
    try {
      const data = await mcpListSpaces()
      return ok(data)
    } catch (e) {
      return fail(
        rpcError(null, { code: -32603, message: e instanceof Error ? e.message : "list_spaces 失败" })
      )
    }
  },
}

// ============================================================
// list_locations — 返回嵌套树
// ============================================================

const ListLocationsInput = z.object({
  spaceId: z.coerce.number().int().positive(),
})

type LocationTreeNode = {
  id: number
  name: string
  parentId: number | null
  sortOrder: number
  itemCount: number
  children: LocationTreeNode[]
}

export const ListLocationsTool = {
  name: "list_locations",
  description:
    "List all locations in a space as a nested tree. Each node includes id, name, parent id, sort order, item count, and children.",
  inputSchema: ListLocationsInput,
  handler: async (args: z.infer<typeof ListLocationsInput>): Promise<McpToolResult> => {
    const access = await checkSpaceAccess(args.spaceId)
    if (!access.ok) return fail(access.error)

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        parentId: locations.parentId,
        sortOrder: locations.sortOrder,
        itemCount: sql<number>`COALESCE(COUNT(${items.id}), 0)`.as("item_count"),
      })
      .from(locations)
      .leftJoin(items, eq(items.locationId, locations.id))
      .where(eq(locations.spaceId, args.spaceId))
      .groupBy(locations.id)
      .orderBy(asc(locations.sortOrder), asc(locations.id))

    // 服务端 buildTree（v1.2.1 critical bug 修复版：递归 + visited set 保证父先处理）
    const nodeMap = new Map<number, LocationTreeNode>()
    for (const r of rows) {
      nodeMap.set(r.id, {
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        sortOrder: r.sortOrder,
        itemCount: r.itemCount,
        children: [],
      })
    }
    const roots: LocationTreeNode[] = []
    const visited = new Set<number>()
    const visit = (n: LocationTreeNode) => {
      if (visited.has(n.id)) return
      visited.add(n.id)
      if (n.parentId == null) {
        roots.push(n)
      } else {
        const parent = nodeMap.get(n.parentId)
        if (parent) {
          visit(parent)
          parent.children.push(n)
        } else {
          roots.push(n)
        }
      }
    }
    for (const n of nodeMap.values()) visit(n)

    return ok(roots)
  },
}

// ============================================================
// list_categories — 扁平列表（含 itemCount）
// ============================================================

const ListCategoriesInput = z.object({
  spaceId: z.coerce.number().int().positive(),
})

export const ListCategoriesTool = {
  name: "list_categories",
  description:
    "List all categories in a space as a flat array. Each entry includes id, name, icon, sort order, and item count.",
  inputSchema: ListCategoriesInput,
  handler: async (args: z.infer<typeof ListCategoriesInput>): Promise<McpToolResult> => {
    const access = await checkSpaceAccess(args.spaceId)
    if (!access.ok) return fail(access.error)

    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        sortOrder: categories.sortOrder,
        itemCount: sql<number>`COALESCE(COUNT(${items.id}), 0)`.as("item_count"),
      })
      .from(categories)
      .leftJoin(items, eq(items.categoryId, categories.id))
      .where(eq(categories.spaceId, args.spaceId))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.id))

    return ok(rows)
  },
}

// ============================================================
// list_tags — 扁平列表
// ============================================================

const ListTagsInput = z.object({
  spaceId: z.coerce.number().int().positive(),
})

export const ListTagsTool = {
  name: "list_tags",
  description:
    "List all tags in a space as a flat array. Each entry includes id, name, color, and item count.",
  inputSchema: ListTagsInput,
  handler: async (args: z.infer<typeof ListTagsInput>): Promise<McpToolResult> => {
    const access = await checkSpaceAccess(args.spaceId)
    if (!access.ok) return fail(access.error)

    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        itemCount: sql<number>`COALESCE(COUNT(${itemTags.itemId}), 0)`.as("item_count"),
      })
      .from(tags)
      .leftJoin(itemTags, eq(itemTags.tagId, tags.id))
      .where(eq(tags.spaceId, args.spaceId))
      .groupBy(tags.id)
      .orderBy(asc(tags.id))

    return ok(rows)
  },
}

// ============================================================
// search_items — 复用 queryItems
// ============================================================

const SearchItemsInput = z.object({
  spaceId: z.coerce.number().int().positive(),
  q: z.string().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  tagIds: z
    .union([z.coerce.number().int().positive(), z.array(z.coerce.number().int().positive())])
    .optional(),
  exp: z.enum(["expired", "7d", "30d", "all"]).optional(),
  sort: z.enum(["updated", "name", "created"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

function toIntArray(v: unknown): number[] | null {
  if (v == null) return null
  if (Array.isArray(v)) return v as number[]
  return [v as number]
}

export const SearchItemsTool = {
  name: "search_items",
  description:
    "Search items in a space with optional filters (query, category, location subtree, tags, expiry). Returns paginated items with images and tags.",
  inputSchema: SearchItemsInput,
  handler: async (args: z.infer<typeof SearchItemsInput>): Promise<McpToolResult> => {
    const access = await checkSpaceAccess(args.spaceId)
    if (!access.ok) return fail(access.error)

    // 单 locationId → 展开为子树（与 UI 的 /items?loc=X 行为一致）
    const loc = args.locationId
      ? await expandLocationIds(args.spaceId, [args.locationId])
      : toIntArray((args as { loc?: number[] | null }).loc)

    const result = await queryItems({
      spaceId: args.spaceId,
      q: args.q ?? "",
      cat: args.categoryId ?? null,
      loc,
      tag: toIntArray(args.tagIds),
      sort: args.sort ?? "updated",
      page: args.page ?? 1,
      exp: args.exp ?? "all",
    })

    return ok(result)
  },
}

// ============================================================
// get_item — 复用 queryItemById + 拼 tags
// ============================================================

const GetItemInput = z.object({
  spaceId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
})

export const GetItemTool = {
  name: "get_item",
  description:
    "Get full details for a single item by id: name, description, quantity, price, expiry, category, location, ordered images, joined tags.",
  inputSchema: GetItemInput,
  handler: async (args: z.infer<typeof GetItemInput>): Promise<McpToolResult> => {
    const access = await checkSpaceAccess(args.spaceId)
    if (!access.ok) return fail(access.error)

    const { item, images } = await queryItemById(args.spaceId, args.itemId)
    if (!item) {
      return ok({ item: null, images: [], tags: [] })
    }

    // 拼 joined tags（与 items/[id]/page.tsx:124-131 一致）
    const joinedTags = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(itemTags)
      .innerJoin(tags, eq(itemTags.tagId, tags.id))
      .where(eq(itemTags.itemId, args.itemId))

    return ok({ item, images, tags: joinedTags })
  },
}