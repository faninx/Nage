"use client"

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

const OPTIONS: { value: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "浅色", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "暗黑", icon: <Moon className="size-3.5" /> },
  { value: "system", label: "跟随系统", icon: <Monitor className="size-3.5" /> },
]

export function ThemeToggle() {
  // next-themes 接管：storageKey="nage-theme" 跟之前一致，localStorage 不丢
  // mounted 标志避免 hydration mismatch（服务端不知道用户当前主题）
  const { theme, setTheme, resolvedTheme } = useTheme()

  // 注意：useTheme() 的 theme 是用户选择（"light"/"dark"/"system"），resolvedTheme 是
  // 实际生效的（系统模式时是 "light" 或 "dark"）。按钮 active 状态用用户选择，不用 resolved。
  const active = theme

  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className="inline-flex items-center rounded-md border bg-card p-0.5"
    >
      {OPTIONS.map((o) => {
        const isActive = active === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={o.label}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-sm size-7 transition-colors",
              isActive
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {o.icon}
          </button>
        )
      })}
    </div>
  )
}
