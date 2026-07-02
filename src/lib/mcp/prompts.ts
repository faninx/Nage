/**
 * MCP Prompts（M8.4+）。
 *
 * Prompts = 预定义的消息模板，AI 客户端可以"调用 prompt"拿到一组结构化消息
 * （通常是 system + user 提示词）。常见用途：
 * - "audit_expiring_soon"：让 AI 帮你查快过期的物品清单
 * - "find_item"：让 AI 帮你按关键词搜物品
 * - "inventory_summary"：让 AI 给你一份空间汇总
 *
 * 每个 prompt callback 通过 currentMcpAuth + hasSpaceAccess 鉴权。
 */

import "server-only"
import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

type McpPromptResult = {
  messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }>
}

// ============================================================
// audit_expiring_soon
// ============================================================

const auditArgs = {
  spaceId: z.coerce.number().int().positive().describe("空间 ID"),
  days: z.coerce.number().int().min(1).max(365).default(30).describe("查 N 天内过期的物品"),
}

function auditExpiringSoon(args: {
  spaceId: number
  days?: number
}): McpPromptResult {
  const days = args.days ?? 30
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `请帮我审计空间 ${args.spaceId} 中 ${days} 天内即将过期的物品。\n` +
            `步骤：\n` +
            `1. 调用 list_tags 了解可用标签；调用 list_categories 了解分类\n` +
            `2. 用 search_items(spaceId=${args.spaceId}, exp="${days}d") 找出快过期的物品\n` +
            `3. 对每件快过期的物品调用 get_item 拿完整信息（含 tags / images / expiredAt）\n` +
            `4. 输出汇总表：名称 | 分类 | 位置 | 标签 | 过期日期 | 距离 N 天\n` +
            `5. 给出建议：哪些需要尽快处理、哪些可以延期`,
        },
      },
    ],
  }
}

// ============================================================
// find_item
// ============================================================

const findArgs = {
  spaceId: z.coerce.number().int().positive().describe("空间 ID"),
  query: z.string().min(1).max(100).describe("搜索关键词（匹配名称 / 描述 / 标签）"),
}

function findItem(args: { spaceId: number; query: string }): McpPromptResult {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `请在空间 ${args.spaceId} 中帮我找关键词 "${args.query}"。\n` +
            `步骤：\n` +
            `1. 先调用 list_tags 拿到该空间所有标签名\n` +
            `2. 调用 search_items(spaceId=${args.spaceId}, q="${args.query}") 模糊搜索\n` +
            `3. 命中后调用 get_item 拿完整细节\n` +
            `4. 输出候选清单（含位置 / 数量 / 过期时间），告诉我哪个最匹配`,
        },
      },
    ],
  }
}

// ============================================================
// inventory_summary
// ============================================================

const summaryArgs = {
  spaceId: z.coerce.number().int().positive().describe("空间 ID"),
}

function inventorySummary(args: { spaceId: number }): McpPromptResult {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `请给我一份空间 ${args.spaceId} 的整体库存汇总。\n` +
            `步骤：\n` +
            `1. list_locations / list_categories / list_tags 了解结构\n` +
            `2. search_items(spaceId=${args.spaceId}, page=1) 看头 20 个\n` +
            `3. 输出：\n` +
            `   - 总物品数（按 search_items.total）\n` +
            `   - 分类分布（category -> count）\n` +
            `   - 位置分布（location -> count）\n` +
            `   - 快过期数量（exp="7d" / "30d"）\n` +
            `   - 没有图片 / 描述 / 位置的"残缺"物品清单`,
        },
      },
    ],
  }
}

// ============================================================
// 注册
// ============================================================

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "audit_expiring_soon",
    {
      title: "Audit expiring items",
      description: "让 AI 帮你查快过期的物品并给出处理建议",
      argsSchema: auditArgs,
    },
    auditExpiringSoon
  )
  server.registerPrompt(
    "find_item",
    {
      title: "Find an item by keyword",
      description: "让 AI 按关键词帮你找物品",
      argsSchema: findArgs,
    },
    findItem
  )
  server.registerPrompt(
    "inventory_summary",
    {
      title: "Inventory summary",
      description: "让 AI 给你空间整体汇总",
      argsSchema: summaryArgs,
    },
    inventorySummary
  )
}