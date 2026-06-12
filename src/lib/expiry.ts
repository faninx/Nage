/**
 * 过期时间桶与展示样式。
 *
 * 规则：days = Math.ceil((expiredAt - now) / 86400)
 * - "expired" : days < 0  → 已过期
 * - "7d"      : 0 ≤ days ≤ 7  → 7 天内
 * - "30d"     : 7 < days ≤ 30 → 30 天内
 * - "future"  : days > 30 → 仅展示日期
 * - null     : 未设置过期时间
 *
 * 「仪表盘快过期」「列表 ExpiryBadge」「详情过期时间」共用此规则。
 */
export type ExpiryBucket = "expired" | "7d" | "30d" | "future"

const ORDER: Record<ExpiryBucket, number> = {
  expired: 0,
  "7d": 1,
  "30d": 2,
  future: 3,
}

const CLASS: Record<ExpiryBucket, string> = {
  expired: "text-muted-foreground",
  "7d": "text-red-600 dark:text-red-400",
  "30d": "text-orange-600 dark:text-orange-400",
  future: "text-muted-foreground",
}

export function expiryBucket(days: number): ExpiryBucket {
  if (days < 0) return "expired"
  if (days <= 7) return "7d"
  if (days <= 30) return "30d"
  return "future"
}

export function expiryOrder(b: ExpiryBucket): number {
  return ORDER[b]
}

export function expiryClass(b: ExpiryBucket): string {
  return CLASS[b]
}

/** 短标签（列表/卡片用）：「N 天后过期」/「已过期 N 天」/「YYYY-MM-DD」 */
export function expiryLabel(days: number, expiredAt?: string | null): string {
  const b = expiryBucket(days)
  if (b === "expired") return `已过期 ${-days} 天`
  if (b === "future") return expiredAt ? expiredAt.slice(0, 10) : ""
  return `${days} 天后过期`
}

/** 详情页用长标签：「N 天后过期（dateStr）」 */
export function expiryLabelDetail(days: number, expiredAt: string): string {
  const dateStr = new Date(expiredAt).toLocaleDateString("zh-CN")
  const b = expiryBucket(days)
  if (b === "expired") return `已过期 ${-days} 天（${dateStr}）`
  if (b === "future") return dateStr
  return `${days} 天后过期（${dateStr}）`
}
