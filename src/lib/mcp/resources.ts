/**
 * MCP Resources（M8.4+）。
 *
 * Resources = AI 可订阅的「数据视图」。每个 resource 由 URI 标识，读时回调
 * 返回内容（文本 / JSON）。这里暴露：
 *
 * - `nage://items/{id}` — 单个物品详情（鉴权：viewer+ on item.spaceId）
 * - `nage://spaces/{sid}/locations` — 空间的位置树
 * - `nage://spaces/{sid}/tags` — 空间的标签列表
 * - `nage://spaces/{sid}/categories` — 空间的分类列表
 *
 * 每个 resource callback 都通过 currentMcpAuth + hasSpaceAccess 鉴权。
 */

import "server-only"
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories as categoriesTable, items, locations, tags as tagsTable } from "@/lib/db/schema"
import { queryItemById } from "@/lib/db/items-query"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { currentMcpAuth } from "@/lib/mcp/context"
import { RPC_ERROR } from "@/lib/mcp/errors"

type McpResourceResult = {
  contents: Array<{ uri: string; mimeType: string; text: string }>
}

function jsonResult(uri: string, data: unknown): McpResourceResult {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
  }
}

function errResult(uri: string, code: number, message: string): McpResourceResult {
  return {
    contents: [{ uri, mimeType: "text/plain", text: `Error ${code}: ${message}` }],
  }
}

async function requireViewer(sid: number): Promise<
  | { ok: true; userId: number }
  | { ok: false; result: McpResourceResult; uri: string }
> {
  const auth = currentMcpAuth()
  if (!auth) {
    return {
      ok: false,
      uri: `nage://spaces/${sid}`,
      result: errResult(`nage://spaces/${sid}`, RPC_ERROR.unauth.code, RPC_ERROR.unauth.message),
    }
  }
  if (!(await hasSpaceAccess(auth.userId, sid, "viewer"))) {
    return {
      ok: false,
      uri: `nage://spaces/${sid}`,
      result: errResult(
        `nage://spaces/${sid}`,
        RPC_ERROR.forbidden.code,
        `${RPC_ERROR.forbidden.message}（space ${sid}）`
      ),
    }
  }
  return { ok: true, userId: auth.userId }
}

// ============================================================
// Item resource (template by id)
// ============================================================

const itemTemplate = new ResourceTemplate("nage://items/{id}", {
  list: async () => {
    // 可选：返回所有 items URI 用于 list。但 items 可能很多，跳过
    return { resources: [] }
  },
})

async function readItem(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<McpResourceResult> {
  const idStr = String(variables.id)
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return errResult(uri.toString(), -32602, `invalid id: ${idStr}`)
  }
  // 先取 item 找 spaceId（才能鉴权）
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, id))
    .limit(1)
  if (!row) {
    return errResult(uri.toString(), -32602, "item not found")
  }
  const access = await requireViewer(row.spaceId)
  if (!access.ok) return access.result

  const { item, images } = await queryItemById(row.spaceId, id)
  return jsonResult(uri.toString(), { item, images })
}

// ============================================================
// Space sub-resources (locations / tags / categories)
// 静态 URI 形式（每个空间一个 resource；MCP 不支持在静态 resource 内带 path variable）
// 但 sid 变化 → URI 变化 → 必须注册为 template。
// 用 ResourceTemplate 但 list() 提供所有空间的实际 URI。
// ============================================================

function makeSpaceTemplate(path: string, _displayName: string) {
  return new ResourceTemplate(`nage://spaces/{sid}/${path}`, { list: undefined })
}

async function readLocations(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<McpResourceResult> {
  const sid = Number(String(variables.sid))
  if (!Number.isInteger(sid) || sid <= 0) {
    return errResult(uri.toString(), -32602, `invalid sid: ${variables.sid}`)
  }
  const access = await requireViewer(sid)
  if (!access.ok) return access.result

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      parentId: locations.parentId,
      sortOrder: locations.sortOrder,
    })
    .from(locations)
    .where(eq(locations.spaceId, sid))
    .orderBy(locations.sortOrder, locations.id)

  return jsonResult(uri.toString(), rows)
}

async function readTags(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<McpResourceResult> {
  const sid = Number(String(variables.sid))
  if (!Number.isInteger(sid) || sid <= 0) {
    return errResult(uri.toString(), -32602, `invalid sid: ${variables.sid}`)
  }
  const access = await requireViewer(sid)
  if (!access.ok) return access.result

  const rows = await db
    .select({ id: tagsTable.id, name: tagsTable.name, color: tagsTable.color })
    .from(tagsTable)
    .where(eq(tagsTable.spaceId, sid))
    .orderBy(asc(tagsTable.id))
  return jsonResult(uri.toString(), rows)
}

async function readCategories(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<McpResourceResult> {
  const sid = Number(String(variables.sid))
  if (!Number.isInteger(sid) || sid <= 0) {
    return errResult(uri.toString(), -32602, `invalid sid: ${variables.sid}`)
  }
  const access = await requireViewer(sid)
  if (!access.ok) return access.result

  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      icon: categoriesTable.icon,
      sortOrder: categoriesTable.sortOrder,
    })
    .from(categoriesTable)
    .where(eq(categoriesTable.spaceId, sid))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id))
  return jsonResult(uri.toString(), rows)
}

// ============================================================
// 注册
// ============================================================

export function registerResources(server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer): void {
  server.registerResource("nage_item", itemTemplate, { description: "Single item detail" }, readItem)
  server.registerResource(
    "nage_space_locations",
    makeSpaceTemplate("locations", "Locations in a space"),
    { description: "All locations in a space (flat list)" },
    readLocations
  )
  server.registerResource(
    "nage_space_tags",
    makeSpaceTemplate("tags", "Tags in a space"),
    { description: "All tags in a space" },
    readTags
  )
  server.registerResource(
    "nage_space_categories",
    makeSpaceTemplate("categories", "Categories in a space"),
    { description: "All categories in a space" },
    readCategories
  )
}