"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Check, MapPin, Minus, X } from "lucide-react"

export type LocNode = {
 id: number
 name: string
 parentId: number | null
 sortOrder: number
}

type Props = {
 locations: LocNode[]
 value: number[]
 onChange: (ids: number[]) => void
 placeholder?: string
 disabled?: boolean
 /** 空值项文案 */
 clearLabel?: string
}

export function LocationTreeMultiSelect({
 locations,
 value,
 onChange,
 placeholder = "全部位置",
 disabled,
 clearLabel = "（全部位置）",
}: Props) {
 const { childrenMap, roots, allLeaves } = useMemo(() => {
 const cm = new Map<number | null, LocNode[]>()
 for (const l of locations) {
 const arr = cm.get(l.parentId) ?? []
 arr.push(l)
 cm.set(l.parentId, arr)
 }
 for (const arr of cm.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
 // leaf IDs（没有 children的节点）
 const leaves = new Set<number>()
 function collectLeaves(parentId: number | null) {
 for (const n of cm.get(parentId) ?? []) {
 if ((cm.get(n.id) ?? []).length ===0) leaves.add(n.id)
 else collectLeaves(n.id)
 }
 }
 collectLeaves(null)
 return {
 childrenMap: cm,
 roots: cm.get(null) ?? [],
 allLeaves: leaves,
 }
 }, [locations])

 const [open, setOpen] = useState(false)
 // 标记用户是否真正打开过 popover（避免 mount 时把 server 端"父+子"展开态当 diff 提交）
 const hasOpened = useRef(false)
 // draft只存 leaf IDs。打开时把外部 value里的非 leaf展开成 leaves
 const [draft, setDraft] = useState<Set<number>>(() =>
 new Set(expandToLeaves(value, allLeaves))
 )
 const [expanded, setExpanded] = useState<Set<number>>(() => {
 const init = new Set<number>()
 for (const l of locations) if (l.parentId == null) init.add(l.id)
 for (const id of value) {
 const byId = new Map(locations.map((l) => [l.id, l]))
 let cur: LocNode | undefined = byId.get(id)
 while (cur) {
 init.add(cur.id)
 cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
 }
 }
 return init
 })

 //打开时把外部 value同步到 draft
 useEffect(() => {
 if (open) {
 setDraft((prev) => {
 const next = new Set(prev)
 for (const id of expandToLeaves(value, allLeaves)) next.add(id)
 return next
 })
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [open])

 //关闭时提交（仅传 leaves）
 useEffect(() => {
 if (open) {
 hasOpened.current = true
 return
 }
 if (!hasOpened.current) return
 const sortedDraft = [...draft].sort((a, b) => a - b)
 const sortedValue = [...value].sort((a, b) => a - b)
 const same =
 sortedDraft.length === sortedValue.length &&
 sortedDraft.every((v, i) => v === sortedValue[i])
 if (!same) onChange(sortedDraft)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [open])

 //取一个节点的所有 leaf descendants
 function getLeaves(id: number): number[] {
 const result: number[] = []
 const stack = [id]
 while (stack.length) {
 const cur = stack.pop()!
 const kids = childrenMap.get(cur) ?? []
 if (kids.length ===0) result.push(cur)
 else for (const k of kids) stack.push(k.id)
 }
 return result
 }

 function toggle(id: number) {
 setDraft((prev) => {
 const next = new Set(prev)
 if (allLeaves.has(id)) {
 // leaf：直接 toggle
 if (next.has(id)) next.delete(id)
 else next.add(id)
 } else {
 //父级：递归 toggle 所有 leaves
 const leaves = getLeaves(id)
 const allSelected = leaves.length >0 && leaves.every((l) => next.has(l))
 if (allSelected) {
 for (const l of leaves) next.delete(l)
 } else {
 for (const l of leaves) next.add(l)
 }
 }
 return next
 })
 }

 function toggleExpand(id: number) {
 setExpanded((prev) => {
 const next = new Set(prev)
 if (next.has(id)) next.delete(id)
 else next.add(id)
 return next
 })
 }

 function clearAll() {
 setDraft(new Set())
 }

 const selectedLeafCount = draft.size

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <Button
 type="button"
 variant="outline"
 disabled={disabled}
 className={cn(
 "w-full justify-between font-normal h-8 px-2.5",
 selectedLeafCount ===0 && "text-muted-foreground"
 )}
 >
 <span className="flex items-center gap-1.5 truncate">
 {selectedLeafCount >0 ? (
 <>
 <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
 <span className="truncate">已选 {selectedLeafCount} 个位置</span>
 </>
 ) : (
 <span>{placeholder}</span>
 )}
 </span>
 <ChevronDown className="size-4 shrink-0 opacity-50" />
 </Button>
 </PopoverTrigger>
 <PopoverContent
 className="p-0 overflow-hidden"
 style={{ width: "var(--radix-popover-trigger-width)" }}
 align="start"
 >
 <div
 className="max-h-72 overflow-y-auto p-1"
 onWheel={(e) => e.stopPropagation()}
 >
 <button
 type="button"
 onClick={clearAll}
 className={cn(
 "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left",
 selectedLeafCount ===0 && "bg-accent/50"
 )}
 >
 <span className="size-4 shrink-0 rounded border flex items-center justify-center">
 {selectedLeafCount ===0 && <Check className="size-3 text-primary" />}
 </span>
 <X className="size-3.5 text-muted-foreground" />
 <span className="flex-1 truncate text-muted-foreground">
 {clearLabel}
 </span>
 </button>

 {roots.length ===0 && (
 <p className="text-xs text-muted-foreground text-center py-3">
暂无位置
 </p>
 )}

 {roots.map((node) => (
 <TreeNode
 key={node.id}
 node={node}
 depth={0}
 draft={draft}
 expanded={expanded}
 onToggle={toggle}
 onToggleExpand={toggleExpand}
 childrenMap={childrenMap}
 getLeaves={getLeaves}
 />
 ))}
 </div>
 <div className="border-t px-2 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
 <span>已选 {draft.size} 个</span>
 <span>点空白处关闭</span>
 </div>
 </PopoverContent>
 </Popover>
 )
}

function TreeNode({
 node,
 depth,
 draft,
 expanded,
 onToggle,
 onToggleExpand,
 childrenMap,
 getLeaves,
}: {
 node: LocNode
 depth: number
 draft: Set<number>
 expanded: Set<number>
 onToggle: (id: number) => void
 onToggleExpand: (id: number) => void
 childrenMap: Map<number | null, LocNode[]>
 getLeaves: (id: number) => number[]
}) {
 const children = childrenMap.get(node.id) ?? []
 const hasChildren = children.length >0
 const isOpen = expanded.has(node.id)

 //父级 checkbox 三态
 let checkState: "empty" | "indeterminate" | "checked" = "empty"
 if (hasChildren) {
 const leaves = getLeaves(node.id)
 if (leaves.length >0) {
 const selected = leaves.filter((l) => draft.has(l)).length
 if (selected ===0) checkState = "empty"
 else if (selected === leaves.length) checkState = "checked"
 else checkState = "indeterminate"
 }
 } else {
 // leaf：简单 checked/empty
 checkState = draft.has(node.id) ? "checked" : "empty"
 }

 return (
 <div>
 <div
 className={cn(
 "flex items-center gap-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground text-sm cursor-pointer",
 (checkState !== "empty") && "bg-accent/40"
 )}
 style={{ paddingLeft:4 + depth *12 }}
 onClick={() => onToggle(node.id)}
 >
 {hasChildren ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 onToggleExpand(node.id)
 }}
 className="size-5 shrink-0 flex items-center justify-center rounded hover:bg-foreground/10"
 aria-label={isOpen ? "收起" : "展开"}
 >
 {isOpen ? (
 <ChevronDown className="size-3.5" />
 ) : (
 <ChevronRight className="size-3.5" />
 )}
 </button>
 ) : (
 <span className="size-5 shrink-0" />
 )}
 <span
 className={cn(
 "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
 checkState === "checked" && "bg-primary border-primary text-primary-foreground",
 checkState === "indeterminate" && "bg-primary/50 border-primary text-primary-foreground",
 checkState === "empty" && "bg-background"
 )}
 >
 {checkState === "checked" && <Check className="size-3" />}
 {checkState === "indeterminate" && <Minus className="size-3" />}
 </span>
 <span className="flex-1 truncate py-1.5 pr-2">{node.name}</span>
 </div>
 {hasChildren && isOpen && (
 <div>
 {children.map((c) => (
 <TreeNode
 key={c.id}
 node={c}
 depth={depth +1}
 draft={draft}
 expanded={expanded}
 onToggle={onToggle}
 onToggleExpand={onToggleExpand}
 childrenMap={childrenMap}
 getLeaves={getLeaves}
 />
 ))}
 </div>
 )}
 </div>
 )
}

/** 把包含父级 ID 的数组展开成纯 leaf IDs */
function expandToLeaves(value: number[], allLeaves: Set<number>): number[] {
 const result: number[] = []
 for (const id of value) {
 if (allLeaves.has(id)) result.push(id)
 //非 leaf ID忽略（应该不会出现在 URL 中）
 }
 return result
}
