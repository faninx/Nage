import type { SpaceRole } from "@/lib/db/schema"

/** 角色中文标签。 */
export const ROLE_LABEL: Record<SpaceRole, string> = {
  owner: "所有者",
  editor: "编辑",
  viewer: "查看",
}

/** 角色 Badge 基础样式（无 hover 态）。 */
export const ROLE_STYLE: Record<SpaceRole, string> = {
  owner: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  editor: "bg-muted text-muted-foreground border-border",
  viewer: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
}

/** 角色 Badge 含 hover 态（用于可点击的角色 Select）。 */
export const ROLE_STYLE_HOVER: Record<SpaceRole, string> = {
  owner: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20",
  editor: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  viewer: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20",
}

/** 角色说明（成员管理页用）。 */
export const ROLE_DESC: Record<SpaceRole, string> = {
  owner: "全部权限 + 管理成员 + 改/删空间",
  editor: "增删改物品/位置/分类/标签",
  viewer: "只读",
}
