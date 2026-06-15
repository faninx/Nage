import { revalidatePath } from "next/cache"

/**
 * 与"我的空间列表"相关的 server action 共用 revalidate 集合。
 * 集中起来避免散落各处漏写。
 */
export function revalidateMySpaces() {
  revalidatePath("/spaces", "layout")
}
