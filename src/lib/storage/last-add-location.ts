// 共享 localStorage：两个添加物品弹窗（quick-add / items-page 创建）共用"上次选择的位置"。
// 值格式：JSON 正整数（locationId），不存在 / null / 非法 → 返回 null。
// 校验"该 id 是否还在当前空间的位置列表里"在这里做，避免切空间 / 删位置后拿到死链。

const KEY = "nage-last-add-location"

export function readLastAddLocation(
  locations: ReadonlyArray<{ id: number }>
): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const id = JSON.parse(raw)
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null
    return locations.some((l) => l.id === id) ? id : null
  } catch {
    return null
  }
}

export function writeLastAddLocation(id: number | null): void {
  if (typeof window === "undefined") return
  try {
    if (id === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(id))
  } catch {
    // private mode / quota：静默忽略
  }
}