"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ArrowRight, Clock, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

export type ExpiringItem = {
  id: number
  name: string
  expiredAt: Date
}

type Bucket = "expired" | "7d" | "30d"

type Annotated = ExpiringItem & {
  /** 正数=N 天后过期；负数=|N| 天前过期 */
  days: number
  bucket: Bucket
}

const HIDE_EXPIRED_KEY = "nage-dashboard-hide-expired"

/** 「快过期」卡片：服务端传 items 进来，客户端按 7d/30d/expired 分组 + 切换「隐藏已过期」 */
export function ExpiringSoonCard({ items }: { items: ExpiringItem[] }) {
  const [hideExpired, setHideExpired] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // 从 localStorage 读偏好
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_EXPIRED_KEY) === "1") setHideExpired(true)
    } catch {}
    setHydrated(true)
  }, [])

  // 持久化
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(HIDE_EXPIRED_KEY, hideExpired ? "1" : "0")
    } catch {}
  }, [hideExpired, hydrated])

  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000)

  // 标注每条到对应桶：expired / 7d / 30d
  const annotated: Annotated[] = []
  for (const e of items) {
    if (!e.expiredAt) continue
    const expSec = Math.floor(e.expiredAt.getTime() / 1000)
    const diffDays = Math.ceil((expSec - nowSec) / 86400)
    let bucket: Bucket
    if (diffDays < 0) bucket = "expired"
    else if (diffDays <= 7) bucket = "7d"
    else if (diffDays <= 30) bucket = "30d"
    else continue
    annotated.push({ ...e, days: diffDays, bucket })
  }
  // 桶内排序：已过期按过期最早优先（days 最小，即 |days| 最大）；其余按 days 升序
  annotated.sort((a, b) => {
    if (a.bucket === "expired" && b.bucket === "expired") return b.days - a.days
    return a.days - b.days
  })

  const expiredCount = annotated.filter((a) => a.bucket === "expired").length
  const in7dCount = annotated.filter((a) => a.bucket === "7d").length
  const in30dCount = annotated.filter((a) => a.bucket === "30d").length

  const visible = hideExpired
    ? annotated.filter((a) => a.bucket !== "expired")
    : annotated

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Clock className="size-4" />
          快过期
          <Button
            type="button"
            variant={hideExpired ? "secondary" : "ghost"}
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => setHideExpired((v) => !v)}
            disabled={expiredCount === 0}
            aria-pressed={hideExpired}
            title={hideExpired ? "已隐藏已过期" : "隐藏已过期"}
          >
            {hideExpired ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {hideExpired ? "显示已过期" : "隐藏已过期"}
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Link href="/items?exp=30d">
              查看全部
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {expiredCount > 0 && !hideExpired && (
            <Link
              href="/items?exp=expired"
              className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
            >
              <AlertTriangle className="size-3" />
              已过期 {expiredCount}
            </Link>
          )}
          {in7dCount > 0 && (
            <Link
              href="/items?exp=7d"
              className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
            >
              7 天内 {in7dCount}
            </Link>
          )}
          {in30dCount > 0 && (
            <Link
              href="/items?exp=30d"
              className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline"
            >
              30 天内 {in30dCount}
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            没有 30 天内即将过期的物品
          </p>
        ) : (
          <ul className="divide-y -mx-2">
            {visible.map((a) => {
              const cls =
                a.bucket === "expired"
                  ? "text-muted-foreground"
                  : a.bucket === "7d"
                    ? "text-red-600 dark:text-red-400"
                    : "text-orange-600 dark:text-orange-400"
              const label =
                a.bucket === "expired" ? `已过期 ${-a.days} 天` : `${a.days} 天后`
              return (
                <li key={a.id}>
                  <Link
                    href={`/items/${a.id}`}
                    className="flex items-center gap-3 px-2 py-2 hover:bg-muted/30 rounded-md"
                  >
                    <AlertTriangle className={cn(cls, "size-4")} />
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">
                      {a.name}
                    </span>
                    <span className={cn(cls, "text-xs whitespace-nowrap")}>{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
