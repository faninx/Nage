"use client"

import { useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Check, MapPin, X } from "lucide-react"

export type LocNode = {
  id: number
  name: string
  parentId: number | null
  sortOrder: number
}

type Props = {
  locations: LocNode[]
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  disabled?: boolean
  /** 空值项文案，传 null 显示 */
  clearLabel?: string
}

export function LocationTreeSelect({
  locations,
  value,
  onChange,
  placeholder = "（不选）",
  disabled,
  clearLabel = "（不选位置）",
}: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // 默认展开所有祖先到 value 的路径 + 根
    const init = new Set<number>()
    for (const l of locations) if (l.parentId == null) init.add(l.id)
    if (value != null) {
      const byId = new Map(locations.map((l) => [l.id, l]))
      let cur: LocNode | undefined = byId.get(value)
      while (cur) {
        init.add(cur.id)
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
      }
    }
    return init
  })

  const { pathMap, childrenMap, roots } = useMemo(() => {
    const pathMap = new Map<number, string>()
    const childrenMap = new Map<number | null, LocNode[]>()
    const byId = new Map(locations.map((l) => [l.id, l]))
    for (const l of locations) {
      const path: string[] = []
      let cur: LocNode | undefined = l
      let guard = 0
      while (cur && guard++ < 10) {
        path.unshift(cur.name)
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
      }
      pathMap.set(l.id, path.join(" / "))
      const arr = childrenMap.get(l.parentId) ?? []
      arr.push(l)
      childrenMap.set(l.parentId, arr)
    }
    for (const arr of childrenMap.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    return {
      pathMap,
      childrenMap,
      roots: childrenMap.get(null) ?? [],
    }
  }, [locations])

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function pick(id: number | null) {
    onChange(id)
    setOpen(false)
  }

  const selectedLabel = value == null ? null : pathMap.get(value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-8 px-2.5",
            !selectedLabel && "text-muted-foreground"
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            {selectedLabel ? (
              <>
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedLabel}</span>
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
            onClick={() => pick(null)}
            className={cn(
              "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left",
              value == null && "bg-accent/50"
            )}
          >
            <span className="size-4 shrink-0" />
            <X className="size-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">{clearLabel}</span>
            {value == null && <Check className="size-4 text-primary" />}
          </button>

        {roots.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            暂无位置
          </p>
        )}

        {roots.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            value={value}
            expanded={expanded}
            onToggle={toggle}
            onPick={pick}
            childrenMap={childrenMap}
          />
        ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TreeNode({
  node,
  depth,
  value,
  expanded,
  onToggle,
  onPick,
  childrenMap,
}: {
  node: LocNode
  depth: number
  value: number | null
  expanded: Set<number>
  onToggle: (id: number) => void
  onPick: (id: number | null) => void
  childrenMap: Map<number | null, LocNode[]>
}) {
  const children = childrenMap.get(node.id) ?? []
  const hasChildren = children.length > 0
  const isOpen = expanded.has(node.id)
  const isSelected = value === node.id

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-sm hover:bg-accent hover:text-accent-foreground text-sm",
          isSelected && "bg-accent/50"
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.id)
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
        <button
          type="button"
          onClick={() => onPick(node.id)}
          className="flex-1 text-left truncate py-1.5 pr-2"
        >
          {node.name}
        </button>
        {isSelected && <Check className="size-4 text-primary shrink-0 mr-1" />}
      </div>
      {hasChildren && isOpen && (
        <div>
          {children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              value={value}
              expanded={expanded}
              onToggle={onToggle}
              onPick={onPick}
              childrenMap={childrenMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}
