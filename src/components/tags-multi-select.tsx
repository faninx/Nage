"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Loader2, Plus, Tag as TagIcon, X } from "lucide-react"
import { createTagAction } from "@/lib/actions/tags"
import { toast } from "sonner"

export type TagOpt = {
  id: number
  name: string
  color: string | null
}

type Props = {
  tags: TagOpt[]
  value: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
  clearLabel?: string
  disabled?: boolean
  /** 限定多选最大数（默认不限制） */
  max?: number
  /** 提供后可输入+回车/点击创建新标签（需要 spaceId） */
  spaceId?: number
}

export function TagsMultiSelect({
  tags,
  value,
  onChange,
  placeholder = "全部标签",
  clearLabel = "（全部标签）",
  disabled,
  spaceId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, startCreating] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedSet = new Set(value)
  const count = value.length

  // 打开时清空搜索
  useEffect(() => {
    if (open) {
      setQuery("")
      // 自动聚焦搜索框
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // 推 value 给父组件时去重 + 排序
  function commit(next: number[]) {
    const uniq = Array.from(new Set(next)).sort((a, b) => a - b)
    const sameLen = uniq.length === value.length
    const same = sameLen && uniq.every((v, i) => v === value[i])
    if (!same) onChange(uniq)
  }

  function toggle(id: number) {
    if (selectedSet.has(id)) commit(value.filter((v) => v !== id))
    else commit([...value, id])
  }

  function clearAll() {
    commit([])
  }

  const trimmed = query.trim()
  const qLower = trimmed.toLowerCase()
  const filtered = trimmed
    ? tags.filter((t) => t.name.toLowerCase().includes(qLower))
    : tags
  const exactMatch = trimmed
    ? tags.find((t) => t.name.toLowerCase() === qLower)
    : null
  const canCreate = !!spaceId && trimmed.length > 0 && !exactMatch

  function createAndSelect() {
    if (!spaceId || !canCreate || creating) return
    const fd = new FormData()
    fd.append("spaceId", String(spaceId))
    fd.append("name", trimmed)
    startCreating(async () => {
      const res = await createTagAction(undefined, fd)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.data) {
        if (!value.includes(res.data.id)) commit([...value, res.data.id])
        setQuery("")
        toast.success(`已创建标签「${res.data.name}」`)
      }
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    e.stopPropagation()
    if (!trimmed) return
    if (exactMatch) {
      toggle(exactMatch.id)
      setQuery("")
    } else if (canCreate) {
      createAndSelect()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          id="tags-trigger"
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-expanded={open}
          aria-controls="tags-popover"
          className={cn(
            "flex flex-wrap items-center gap-1 min-h-8 w-full rounded-lg border border-input bg-transparent px-2 py-1 text-sm cursor-pointer transition-colors hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            count === 0 && "text-muted-foreground",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          {count === 0 ? (
            <span className="px-0.5">{placeholder}</span>
          ) : (
            <>
              <TagIcon className="size-3.5 shrink-0 text-muted-foreground mr-0.5" />
              {value.map((id) => {
                const tag = tags.find((t) => t.id === id)
                if (!tag) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs leading-none"
                    style={
                      tag.color
                        ? { borderColor: tag.color, color: tag.color }
                        : undefined
                    }
                  >
                    <span className="truncate max-w-[12ch]">{tag.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        commit(value.filter((v) => v !== id))
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label={`移除标签 ${tag.name}`}
                      className="size-3.5 -mr-0.5 rounded-full inline-flex items-center justify-center hover:bg-foreground/10"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                )
              })}
            </>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50 ml-auto" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
      >
        <div className="border-b p-1.5">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={spaceId ? "搜索或输入新建…" : "搜索标签…"}
            className="h-7 text-sm"
            maxLength={50}
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left",
              count === 0 && "bg-accent/50"
            )}
          >
            <span className="size-4 shrink-0 rounded border flex items-center justify-center">
              {count === 0 && <Check className="size-3 text-primary" />}
            </span>
            <X className="size-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">{clearLabel}</span>
          </button>

          {filtered.length === 0 && !canCreate && (
            <p className="text-xs text-muted-foreground text-center py-3">无匹配标签</p>
          )}

          {filtered.map((t) => {
            const checked = selectedSet.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left",
                  checked && "bg-accent/50"
                )}
              >
                <span
                  className={cn(
                    "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                    checked && "bg-primary border-primary text-primary-foreground"
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                <span className="flex-1 truncate">{t.name}</span>
              </button>
            )
          })}

          {canCreate && (
            <button
              type="button"
              onClick={createAndSelect}
              disabled={creating}
              className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left text-primary"
            >
              <span className="size-4 shrink-0 rounded border border-dashed flex items-center justify-center">
                {creating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
              </span>
              <span className="flex-1 truncate">新建「{trimmed}」</span>
              <kbd className="text-[10px] text-muted-foreground">⏎</kbd>
            </button>
          )}
        </div>
        <div className="border-t px-2 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>已选 {count} 个</span>
          <span>点空白处关闭</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
