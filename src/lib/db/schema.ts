import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"
import { relations, sql } from "drizzle-orm"

// ============================================================
// 角色（空间级 ACL 用）
// ============================================================
export const SPACE_ROLES = ["owner", "editor", "viewer"] as const
export type SpaceRole = (typeof SPACE_ROLES)[number]

/** 角色比较：rank(owner=3) >= rank(viewer=1) 即可通过。 */
export function spaceRoleAtLeast(have: SpaceRole, min: SpaceRole): boolean {
  const rank: Record<SpaceRole, number> = { viewer: 1, editor: 2, owner: 3 }
  return rank[have] >= rank[min]
}

// ============================================================
// 用户（管理员模式，无公开注册）
// ============================================================
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  // 当前所在空间（M7.3 起空间切换器用）。NULL = 让服务端 fallback 到自己的默认空间。
  // onDelete: "set null" 防止删空间后这个字段还指着一个不存在的 id
  lastSpaceId: integer("last_space_id").references((): AnySQLiteColumn => spaces.id, {
    onDelete: "set null",
  }),
})

// ============================================================
// 空间（隔离数据用）
// ============================================================
export const spaces = sqliteTable(
  "spaces",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // ownerId 保留作为"创建者/主拥有者"字段，但权限真正由 space_members.role 决定。
    // 主 owner 永远在 space_members 里有一行 role='owner'；外键 cascade 在他被删时一起删空间。
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("spaces_owner_idx").on(t.ownerId)]
)

// ============================================================
// 空间成员（M7 起：空间级 ACL）
// 复合主键 (spaceId, userId)；删除空间 / 用户自动 cascade。
// ============================================================
export const spaceMembers = sqliteTable(
  "space_members",
  {
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: SPACE_ROLES }).notNull().default("editor"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    index("space_members_user_idx").on(t.userId),
  ]
)

// ============================================================
// 位置（树形，最多 5 级）
// ============================================================
export const locations = sqliteTable(
  "locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("locations_space_idx").on(t.spaceId),
    index("locations_parent_idx").on(t.parentId),
  ]
)

// ============================================================
// 分类
// ============================================================
export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("categories_space_idx").on(t.spaceId)]
)

// ============================================================
// 标签
// ============================================================
export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
  },
  (t) => [index("tags_space_idx").on(t.spaceId)]
)

// ============================================================
// 物品
// ============================================================
export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    locationId: integer("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull().default(1),
    unit: text("unit"),
    price: real("price"),
    expiredAt: integer("expired_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("items_space_idx").on(t.spaceId),
    index("items_category_idx").on(t.categoryId),
    index("items_location_idx").on(t.locationId),
  ]
)

// ============================================================
// 物品图片
// ============================================================
export const itemImages = sqliteTable("item_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})

// ============================================================
// 物品-标签多对多
// ============================================================
export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] })]
)

// ============================================================
// 登录失败计数（防绕过 cookie 锁定）
// ============================================================
export const loginAttempts = sqliteTable("login_attempts", {
  username: text("username").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ============================================================
// Relations（用于 Drizzle 的 with: 关联查询）
// ============================================================
export const usersRelations = relations(users, ({ many }) => ({
  spaces: many(spaces),
  spaceMembers: many(spaceMembers),
}))

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  owner: one(users, { fields: [spaces.ownerId], references: [users.id] }),
  locations: many(locations),
  categories: many(categories),
  tags: many(tags),
  items: many(items),
  members: many(spaceMembers),
}))

export const spaceMembersRelations = relations(spaceMembers, ({ one }) => ({
  space: one(spaces, { fields: [spaceMembers.spaceId], references: [spaces.id] }),
  user: one(users, { fields: [spaceMembers.userId], references: [users.id] }),
}))

export const locationsRelations = relations(locations, ({ one, many }) => ({
  space: one(spaces, { fields: [locations.spaceId], references: [spaces.id] }),
  parent: one(locations, {
    fields: [locations.parentId],
    references: [locations.id],
    relationName: "parent",
  }),
  children: many(locations, { relationName: "parent" }),
  items: many(items),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  space: one(spaces, { fields: [categories.spaceId], references: [spaces.id] }),
  items: many(items),
}))

export const tagsRelations = relations(tags, ({ one, many }) => ({
  space: one(spaces, { fields: [tags.spaceId], references: [spaces.id] }),
  items: many(itemTags),
}))

export const itemsRelations = relations(items, ({ one, many }) => ({
  space: one(spaces, { fields: [items.spaceId], references: [spaces.id] }),
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  location: one(locations, {
    fields: [items.locationId],
    references: [locations.id],
  }),
  images: many(itemImages),
  tags: many(itemTags),
}))

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
}))

export const itemTagsRelations = relations(itemTags, ({ one }) => ({
  item: one(items, { fields: [itemTags.itemId], references: [items.id] }),
  tag: one(tags, { fields: [itemTags.tagId], references: [tags.id] }),
}))

// ============================================================
// 类型导出
// ============================================================
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Space = typeof spaces.$inferSelect
export type NewSpace = typeof spaces.$inferInsert
export type SpaceMember = typeof spaceMembers.$inferSelect
export type NewSpaceMember = typeof spaceMembers.$inferInsert
export type Location = typeof locations.$inferSelect
export type NewLocation = typeof locations.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
