"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"
const KEY = "nage-theme"
const DEFAULT: Theme = "system"

function readTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT
  const v = localStorage.getItem(KEY)
  if (v === "light" || v === "dark" || v === "system") return v
  return DEFAULT
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "浅色", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "暗黑", icon: <Moon className="size-3.5" /> },
  { value: "system", label: "跟随系统", icon: <Monitor className="size-3.5" /> },
]

export function ThemeToggle() {
  // SSR/首屏：与 ThemeScript 同步后默认显示 System（无 hydration mismatch）
  const [theme, setTheme] = useState<Theme>(DEFAULT)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setTheme(readTheme())
    setHydrated(true)
  }, [])

  // 跟随系统：监听系统主题变化
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  function set(t: Theme) {
    setTheme(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {}
    applyTheme(t)
  }

  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className="inline-flex items-center rounded-md border bg-card p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = hydrated && theme === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => set(o.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-sm size-7 transition-colors",
              active
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
