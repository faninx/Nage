"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
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
  const [draft, setDraft] = useState<Set<number>>(() => new Set(value))
  const [query, setQuery] = useState("")
  const [creating, startCreating] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // 打开时同步外部 value
  useEffect(() => {
    if (open) {
      setDraft(new Set(value))
      setQuery("")
      // 自动聚焦搜索框
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, value])

  // 关闭时提交
  useEffect(() => {
    if (open) return
    const sortedDraft = [...draft].sort((a, b) => a - b)
    const sortedValue = [...value].sort((a, b) => a - b)
    const same =
      sortedDraft.length === sortedValue.length &&
      sortedDraft.every((v, i) => v === sortedValue[i])
    if (!same) onChange(sortedDraft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggle(id: number) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearAll() {
    setDraft(new Set())
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
        setDraft((prev) => {
          const next = new Set(prev)
          next.add(res.data!.id)
          return next
        })
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

  const count = draft.size

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-8 px-2.5",
            count === 0 && "text-muted-foreground"
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            {count > 0 ? (
              <>
                <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">已选 {count} 个标签</span>
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
            const checked = draft.has(t.id)
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
