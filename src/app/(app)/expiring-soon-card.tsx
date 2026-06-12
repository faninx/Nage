"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ArrowRight, Clock, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  expiryBucket,
  expiryClass,
  expiryLabel,
  expiryOrder,
  type ExpiryBucket,
} from "@/lib/expiry"

export type ExpiringItem = {
  id: number
  name: string
  expiredAt: Date
}

type Annotated = ExpiringItem & {
  /** 正数=N 天后过期；负数=|N| 天前过期 */
  days: number
  bucket: ExpiryBucket
}

const HIDE_EXPIRED_KEY = "nage-dashboard-hide-expired"

function readHideExpired(): boolean {
  try {
    return localStorage.getItem(HIDE_EXPIRED_KEY) === "1"
  } catch {
    return false
  }
}

/** 「快过期」卡片：服务端传 items 进来，客户端按 7d/30d/expired 分组 + 切换「隐藏已过期」 */
export function ExpiringSoonCard({ items }: { items: ExpiringItem[] }) {
  // lazy initializer：首屏就拿到 localStorage 偏好，避免「读 + 写 + hydrated」三态
  const [hideExpired, setHideExpired] = useState<boolean>(readHideExpired)

  function toggleHideExpired() {
    setHideExpired((prev) => {
      const next = !prev
      try {
        localStorage.setItem(HIDE_EXPIRED_KEY, next ? "1" : "0")
      } catch {}
      return next
    })
  }

  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000)

  const annotated: Annotated[] = []
  for (const e of items) {
    if (!e.expiredAt) continue
    const expSec = Math.floor(e.expiredAt.getTime() / 1000)
    const diffDays = Math.ceil((expSec - nowSec) / 86400)
    const bucket = expiryBucket(diffDays)
    if (bucket === "future") continue
    annotated.push({ ...e, days: diffDays, bucket })
  }
  // 桶内排序：expired 内按「过期最早优先」（|days| 越大越靠前）；跨桶按桶顺序
  annotated.sort(
    (a, b) => expiryOrder(a.bucket) - expiryOrder(b.bucket) || a.days - b.days
  )

  const counts: Record<ExpiryBucket, number> = { expired: 0, "7d": 0, "30d": 0, future: 0 }
  for (const a of annotated) counts[a.bucket]++

  const visible = hideExpired ? annotated.filter((a) => a.bucket !== "expired") : annotated

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
            onClick={toggleHideExpired}
            disabled={counts.expired === 0}
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
          {counts.expired > 0 && !hideExpired && (
            <Link
              href={`/items?exp=expired`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
            >
              <AlertTriangle className="size-3" />
              已过期 {counts.expired}
            </Link>
          )}
          {counts["7d"] > 0 && (
            <Link
              href={`/items?exp=7d`}
              className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
            >
              7 天内 {counts["7d"]}
            </Link>
          )}
          {counts["30d"] > 0 && (
            <Link
              href={`/items?exp=30d`}
              className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline"
            >
              30 天内 {counts["30d"]}
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
            {visible.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/items/${a.id}`}
                  className="flex items-center gap-3 px-2 py-2 hover:bg-muted/30 rounded-md"
                >
                  <AlertTriangle className={cn(expiryClass(a.bucket), "size-4")} />
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {a.name}
                  </span>
                  <span className={cn(expiryClass(a.bucket), "text-xs whitespace-nowrap")}>
                    {expiryLabel(a.days)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
