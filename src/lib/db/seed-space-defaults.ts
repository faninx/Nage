import "server-only"
import { db } from "./index"
import { locations, categories } from "./schema"

/**
 * 新建空间时自动种入的通用位置（2 级树）。
 * 设计取舍：
 *  - 不预设 3 级（电视柜 → 抽屉）：各家柜子结构差异大
 *  - 不放"次卧/玄关/阳台/书房"：不是每家都有，让用户自建
 *  - "储物间"是兜底入口，杂项先塞这里
 */
const DEFAULT_LOCATIONS: ReadonlyArray<{
  name: string
  children: ReadonlyArray<string>
}> = [
  { name: "客厅", children: ["电视柜", "茶几", "沙发"] },
  { name: "主卧", children: ["衣柜", "床头柜"] },
  { name: "厨房", children: ["橱柜", "冰箱"] },
  { name: "卫生间", children: ["镜柜"] },
  { name: "储物间", children: [] },
]

/**
 * 新建空间时自动种入的通用分类。
 * 选型逻辑：
 *  - "食品"和"药品"是核心（v1.3 F14 保质期追踪的强需求）
 *  - 不建"日用"大类（细粒度比粗粒度实用，避免一个分类塞 50 件物品）
 *  - "其他"做兜底
 * 注：categories 表当前没有 color 字段，只存 icon。
 */
const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; icon: string }> = [
  { name: "工具", icon: "🔧" },
  { name: "衣物", icon: "👕" },
  { name: "食品", icon: "🍞" },
  { name: "文具", icon: "✏️" },
  { name: "电子产品", icon: "📱" },
  { name: "证件文件", icon: "📄" },
  { name: "美妆个护", icon: "💄" },
  { name: "药品", icon: "💊" },
  { name: "装饰收藏", icon: "🎨" },
  { name: "其他", icon: "📦" },
]

/**
 * 为新空间种入通用位置和分类。
 *
 * **幂等性**：本函数不查重，重复调用会产生重复节点。
 * 调用方负责保证每个新空间只调一次：
 *  - `ensureDefaultSpace()` —— users 表与 spaceMembers 都为空时
 *  - `createSpaceAction()` —— 用户在 UI 上提交"新建空间"时
 *
 * 不使用事务：失败概率极低（本地 SQLite 单文件），如果中途失败，
 * 用户可手动删除部分种子；包事务会让热路径多一轮 fsync。
 */
export async function seedSpaceDefaults(spaceId: number): Promise<void> {
  // 1) 根位置：批量插入，按输入顺序取回 id
  const rootRows = await db
    .insert(locations)
    .values(
      DEFAULT_LOCATIONS.map((l, i) => ({
        spaceId,
        name: l.name,
        sortOrder: (i + 1) * 10,
      }))
    )
    .returning({ id: locations.id, name: locations.name })

  const rootIdByName = new Map(rootRows.map((r) => [r.name, r.id]))

  // 2) 子位置：摊平后批量插入
  const childValues = DEFAULT_LOCATIONS.flatMap((l) =>
    l.children.map((childName, childIdx) => ({
      spaceId,
      parentId: rootIdByName.get(l.name)!,
      name: childName,
      sortOrder: (childIdx + 1) * 10,
    }))
  )
  if (childValues.length > 0) {
    await db.insert(locations).values(childValues)
  }

  // 3) 分类：一次性批量插入
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      spaceId,
      name: c.name,
      icon: c.icon,
      sortOrder: (i + 1) * 10,
    }))
  )
}
