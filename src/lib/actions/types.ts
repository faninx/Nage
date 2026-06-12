// Shared types and constants for Server Actions.
// IMPORTANT: cannot be in a "use server" file (Next.js only allows async fn exports there).

export type ActionState = { error?: string; ok?: boolean }

export const DEFAULT_SPACE_NAME = "我的家"

export const MAX_IMAGES_PER_ITEM = 9
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB 原图
