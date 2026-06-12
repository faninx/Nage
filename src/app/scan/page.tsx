import { Suspense } from "react"
import { ScanClient } from "./scan-client"

export const dynamic = "force-dynamic"

export default function ScanPage() {
  return (
    <div className="min-h-dvh bg-background">
      <Suspense fallback={null}>
        <ScanClient />
      </Suspense>
    </div>
  )
}
