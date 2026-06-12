"use client"

import { useState, type ChangeEvent } from "react"
import { Input } from "@/components/ui/input"
import { Check, X } from "lucide-react"

const DEFAULT_PICKER = "#888888"
const HEX_RE = /^#[0-9a-fA-F]{6}$/

// 12 个常用预设色（取自 Tailwind 500/600 阶，覆盖暖/冷/中性色）
const PRESETS: { hex: string; name: string }[] = [
  { hex: "#ef4444", name: "红" },
  { hex: "#f97316", name: "橙" },
  { hex: "#eab308", name: "黄" },
  { hex: "#22c55e", name: "绿" },
  { hex: "#14b8a6", name: "青" },
  { hex: "#3b82f6", name: "蓝" },
  { hex: "#6366f1", name: "靛" },
  { hex: "#a855f7", name: "紫" },
  { hex: "#ec4899", name: "粉" },
  { hex: "#a16207", name: "棕" },
  { hex: "#6b7280", name: "灰" },
  { hex: "#1f2937", name: "黑" },
]

/**
 * 颜色选择器：文本输入框 + 色块选择器 + 预设色（三种方式同步）
 * - 用户可在文本框直接输入 #RRGGBB，也可点色块用原生 picker 选，或点下方预设
 * - 文本框输入若不带 # 自动补
 * - hidden input 提交（name 即字段名）
 * - 清除按钮置空
 */
export function ColorPickerInput({
  name,
  id,
  defaultValue,
  disabled,
}: {
  name: string
  id?: string
  defaultValue?: string | null
  disabled?: boolean
}) {
  const init = defaultValue && HEX_RE.test(defaultValue) ? defaultValue : ""
  const [text, setText] = useState<string>(init)
  const valid = HEX_RE.test(text)
  const normalized = text.toLowerCase()

  function onTextChange(e: ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.trim()
    if (v && !v.startsWith("#")) v = "#" + v
    if (v.length > 7) v = v.slice(0, 7)
    setText(v)
  }

  function onPickerChange(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label
          className={
            "relative h-7 w-7 shrink-0 rounded-md border shadow-xs flex items-center justify-center text-[10px] text-muted-foreground transition-colors " +
            (valid ? "border-input " : "border-dashed hover:bg-muted/40 ") +
            (disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer")
          }
          style={valid ? { backgroundColor: text } : undefined}
          aria-label="选择颜色"
        >
          {!valid && "无"}
          <input
            type="color"
            value={valid ? text : DEFAULT_PICKER}
            onChange={onPickerChange}
            disabled={disabled}
            className="absolute inset-0 size-full opacity-0 disabled:cursor-not-allowed"
            tabIndex={disabled ? -1 : 0}
            aria-hidden
          />
        </label>
        <Input
          id={id}
          type="text"
          value={text}
          onChange={onTextChange}
          placeholder="#RRGGBB"
          maxLength={7}
          pattern="^#[0-9a-fA-F]{6}$"
          disabled={disabled}
          className="font-mono w-32 uppercase"
          autoComplete="off"
          spellCheck={false}
        />
        {text && !disabled && (
          <button
            type="button"
            onClick={() => setText("")}
            className="size-6 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="清除颜色"
          >
            <X className="size-3.5" />
          </button>
        )}
        <input type="hidden" name={name} value={text} />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="常用颜色">
        {PRESETS.map((p) => {
          const selected = normalized === p.hex
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => setText(p.hex)}
              disabled={disabled}
              title={`${p.name} ${p.hex}`}
              aria-label={`选择 ${p.name}`}
              aria-pressed={selected}
              className={
                "size-6 rounded-md border flex items-center justify-center transition-all " +
                (selected
                  ? "ring-2 ring-ring ring-offset-1 ring-offset-background "
                  : "hover:scale-110 ") +
                (disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer")
              }
              style={{ backgroundColor: p.hex }}
            >
              {selected && <Check className="size-3.5 text-white drop-shadow" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
