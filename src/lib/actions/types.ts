// Shared types and constants for Server Actions.
// IMPORTANT: cannot be in a "use server" file (Next.js only allows async fn exports there).

export type ActionState = { error?: string; ok?: boolean }

/** MCP 令牌列表项（UI / MCP client 共享） */
export type McpTokenListItem = {
  id: number
  name: string
  lastFour: string
  createdAt: string // ISO
  lastUsedAt: string | null // ISO
}

/** 每个用户首次进入系统时自动建的空间名（"${昵称}的空间"） */
export function defaultSpaceName(nickname: string): string {
  return `${nickname}的空间`
}

export const MAX_IMAGES_PER_ITEM = 9
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB 原图
