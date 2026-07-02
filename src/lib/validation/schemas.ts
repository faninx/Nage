import { z } from "zod"
import { MAX_IMAGES_PER_ITEM } from "@/lib/actions/types"

const name = z.string().min(1, "名称不能为空").max(50, "名称最长 50 字")
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式")
  .optional()
  .or(z.literal(""))
const optionalColor = z.preprocess(
  (v) => (v === "" ? undefined : v),
  color
)

/**
 * 单个 Emoji 校验：用 Intl.Segmenter 按 grapheme cluster 计数
 * - "🍞" 1 cluster → pass
 * - "🏳️‍🌈" 1 cluster（🏳 + VS16 + ZWJ + 🌈）→ pass
 * - "❤️" 1 cluster（❤ + VS16）→ pass
 * - "🍞🍞" 2 clusters → reject
 * - "abc" 文字 → reject
 * - "   " 空白 → reject
 * - 5+ clusters → reject
 */
const singleEmoji = z.preprocess(
  (v) => (v == null ? "" : String(v)),
  z
    .string()
    .max(16, "图标只能是单个 Emoji")
    .refine((s) => {
      if (s === "") return true
      // 全部码点都必须在 Emoji 块 / 修饰符 / ZWJ / 变体选择符 / 组合标记 内
      if (!/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\u{200D}\u{FE0F}\u{20E3}\p{Mark}]+$/u.test(s)) {
        return false
      }
      // 按 grapheme cluster 计数（"🍞🍞" = 2，"🏳️‍🌈" = 1）
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
      let count = 0
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _seg of segmenter.segment(s)) {
        count++
        if (count > 4) return false
      }
      return count === 1
    }, { message: "图标必须是单个 Emoji，不允许文字或多个 Emoji" })
)

const optionalSingleEmoji = z
  .union([z.literal(""), singleEmoji])
  .transform((s) => (s === "" ? null : s))

// ============================================================
// 用户
// ============================================================
export const LoginSchema = z.object({
  username: z.string().min(3, "用户名至少 3 字").max(32),
  password: z.string().min(6, "密码至少 6 位").max(128),
  callbackUrl: z.string().optional(),
})

export const CreateMemberSchema = z.object({
  username: z
    .string()
    .min(3, "用户名至少 3 字")
    .max(32, "用户名最长 32 字")
    .regex(/^[a-zA-Z0-9_-]+$/, "只能字母数字下划线连字符"),
  nickname: z.string().min(1).max(50),
  password: z.string().min(6, "密码至少 6 位").max(128),
  role: z.enum(["admin", "member"]),
})

export const ResetPasswordSchema = z.object({
  userId: z.coerce.number().int().positive(),
  newPassword: z.string().min(6).max(128),
})

export const UpdateMyNicknameSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(50, "昵称最长 50 字"),
})

export const ChangeMyPasswordSchema = z
  .object({
    currentPassword: z.string().min(6, "当前密码至少 6 位").max(128),
    newPassword: z.string().min(6, "新密码至少 6 位").max(128),
    confirmPassword: z.string().min(6).max(128),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  })

// ============================================================
// 空间
// ============================================================
export const CreateSpaceSchema = z.object({
  name,
})

export const RenameSpaceSchema = z.object({
  id: z.coerce.number().int().positive(),
  name,
})

export const DeleteSpaceSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ============================================================
// 位置（5 级树）
// ============================================================
export const CreateLocationSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  parentId: z.coerce.number().int().positive().optional(),
  name,
  description: z.string().max(500).optional().or(z.literal("")),
})

export const RenameLocationSchema = z.object({
  id: z.coerce.number().int().positive(),
  name,
})

export const DeleteLocationSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const MoveLocationSchema = z.object({
  id: z.coerce.number().int().positive(),
  newParentId: z.coerce.number().int().positive().nullable(),
})

/** 拖拽用：把 id 移到 newParentId 下、beforeId 之前；beforeId 为空/0/null 视为末尾 */
export const ReorderLocationSchema = z.object({
  id: z.coerce.number().int().positive(),
  newParentId: z.coerce.number().int().positive().nullable(),
  beforeId: z.coerce.number().int().positive().nullable().optional(),
})

// ============================================================
// 分类
// ============================================================
export const CreateCategorySchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name,
  icon: optionalSingleEmoji,
})

export const UpdateCategorySchema = z.object({
  id: z.coerce.number().int().positive(),
  name,
  icon: optionalSingleEmoji,
})

export const DeleteCategorySchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ============================================================
// 标签
// ============================================================
export const CreateTagSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name,
  color: optionalColor,
})

export const UpdateTagSchema = z.object({
  id: z.coerce.number().int().positive(),
  name,
  color: optionalColor,
})

export const DeleteTagSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ============================================================
// 物品
// ============================================================
/** 把空字符串 / null / undefined 都规整成 null；其余原样透传。 */
const nullifyEmpty = (v: unknown) => (v === "" || v == null ? null : v)

const optionalNullableInt = z.preprocess(
  nullifyEmpty,
  z.coerce.number().int().positive().nullable()
)

// 标签 ids 列表（formData 里是 "1,2,3" 字符串，存到表里是 item_tags 多对多）
const tagIdsCsv = z.preprocess(
  (v) => {
    if (v == null || v === "") return [] as number[]
    return String(v)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
  },
  z.array(z.number().int().positive()).max(20, "标签过多")
)

// 编辑时图片顺序 CSV（"1,2,3" → 数组）。空 = 不重排。长度 = 当前已上传图数量是
// 服务端 permutation 校验的硬约束，缺 / 多 / 重复都会被拒。
const imageOrderCsv = z.preprocess(
  (v) => {
    if (v == null || v === "") return [] as number[]
    return String(v)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
  },
  z.array(z.number().int().positive()).max(MAX_IMAGES_PER_ITEM)
)

// 价格：formData 里的字符串（可能 ""），最多 2 位小数，>= 0，NULL 表示未设
const optionalPrice = z.preprocess(
  nullifyEmpty,
  z
    .coerce
    .number()
    .nonnegative("价格不能为负")
    .multipleOf(0.01, "价格最多 2 位小数")
    .max(99999999.99, "价格过大")
    .nullable()
)

export const CreateItemSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
  name,
  description: z.string().max(5000).optional().or(z.literal("")),
  categoryId: optionalNullableInt,
  locationId: optionalNullableInt,
  quantity: z.coerce.number().int().min(1, "数量至少 1").default(1),
  unit: z.string().max(20).optional().or(z.literal("")),
  price: optionalPrice,
  tagIds: tagIdsCsv.optional().default([]),
  expiredAt: z.preprocess(nullifyEmpty, z.coerce.date().nullable()).optional(),
})

export const UpdateItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  name,
  description: z.string().max(5000).optional().or(z.literal("")),
  categoryId: optionalNullableInt,
  locationId: optionalNullableInt,
  quantity: z.coerce.number().int().min(1, "数量至少 1"),
  unit: z.string().max(20).optional().or(z.literal("")),
  price: optionalPrice,
  tagIds: tagIdsCsv.optional().default([]),
  expiredAt: z.preprocess(nullifyEmpty, z.coerce.date().nullable()).optional(),
  imageOrder: imageOrderCsv.optional().default([]),
})

export const DeleteItemSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const DeleteItemsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
})

export const DeleteItemImageSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ============================================================
// 物品列表（URL searchParams 校验）
// ============================================================
export const ItemSortField = z.enum(["updated", "name", "created"]).default("updated")
export const SortOrder = z.enum(["asc", "desc"]).default("desc")

const optionalNullableIntQuery = z.preprocess(
  nullifyEmpty,
  z.coerce.number().int().positive().nullable()
)

// 多选 id 列表：searchParams 里 loc 可能是单值 string 或 string[]
const intIdListQuery = z.preprocess(
  (v) => {
    if (v == null || v === "") return null
    return Array.isArray(v) ? v : [v]
  },
  z.array(z.coerce.number().int().positive()).nullable()
)

export const ItemListSearchSchema = z.object({
  q: z.string().max(100).optional().or(z.literal("")),
  cat: optionalNullableIntQuery,
  loc: intIdListQuery,
  tag: intIdListQuery,
  sort: ItemSortField,
  page: z.coerce.number().int().min(1).default(1),
  exp: z.enum(["expired", "7d", "30d", "all"]).default("all"),
})

// ============================================================
// MCP 令牌（M8.1+）
// ============================================================
export const CreateMcpTokenSchema = z.object({
  name: z
    .string()
    .min(1, "名称不能为空")
    .max(50, "名称最长 50 字"),
  // M8.2 起：scope 二档；reader=只读；editor=可调写工具
  scope: z.enum(["reader", "editor"]).default("reader"),
})

export const RevokeMcpTokenSchema = z.object({
  id: z.coerce.number().int().positive(),
})
