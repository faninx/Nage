/**
 * 格式化价格为「图标 + 薄空格 + 数字.数字」形式；null/undefined 返回 null。
 * icon 默认为「¥」；列表/卡片视图可传「💴」与其他属性图标（📍🏷📅）保持 emoji 风格一致。
 */
export function formatPrice(
  price: number | null | undefined,
  icon: string = "¥"
): string | null {
  if (price == null) return null
  return `${icon}\u2009${price.toFixed(2)}`
}
