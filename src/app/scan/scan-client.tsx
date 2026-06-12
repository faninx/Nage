"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import jsQR from "jsqr"
import { Button } from "@/components/ui/button"
import { Camera, ScanLine, AlertCircle, ArrowRight } from "lucide-react"

type Status = "idle" | "requesting" | "scanning" | "denied" | "error" | "no-camera" | "found"

export function ScanClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [errMsg, setErrMsg] = useState<string>("")

  // 解析 ?type=&id= 后直接跳转（扫码结果由 query string 传入）
  useEffect(() => {
    const type = searchParams.get("type")
    const id = searchParams.get("id")
    if (type && id) {
      const numId = Number(id)
      if (Number.isInteger(numId) && numId > 0) {
        if (type === "item") {
          router.replace(`/items/${numId}`)
        } else if (type === "location") {
          router.replace(`/items?loc=${numId}`)
        } else {
          setErrMsg(`不支持的扫码类型：${type}`)
        }
      } else {
        setErrMsg("二维码内容无效")
      }
    }
  }, [searchParams, router])

  async function start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("no-camera")
      setErrMsg("此浏览器不支持摄像头访问")
      return
    }
    setStatus("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStatus("scanning")
      tick()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
        setStatus("denied")
        setErrMsg("摄像头权限被拒绝。请在浏览器设置中允许后重试。")
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("requested device")) {
        setStatus("no-camera")
        setErrMsg("未检测到摄像头")
      } else {
        setStatus("error")
        setErrMsg(msg)
      }
    }
  }

  function stop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStatus("idle")
  }

  function tick() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(data.data, data.width, data.height, {
      inversionAttempts: "dontInvert",
    })
    if (code && code.data) {
      setStatus("found")
      handleDecoded(code.data)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleDecoded(text: string) {
    stop()
    try {
      const u = new URL(text)
      const type = u.searchParams.get("type")
      const id = u.searchParams.get("id")
      if (type && id) {
        const newUrl = `/scan?type=${type}&id=${id}`
        router.replace(newUrl)
        return
      }
      // 兜底：直接跳到目标地址（仅限同源）
      if (u.origin === window.location.origin) {
        router.replace(u.pathname + u.search)
        return
      }
      setErrMsg(`二维码内容无法解析：${text}`)
      setStatus("error")
    } catch {
      setErrMsg(`二维码内容不是有效链接：${text}`)
      setStatus("error")
    }
  }

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:"
  const isLocalhost = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  const canUseCamera = isHttps || isLocalhost

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="size-5" />
        <h1 className="text-xl font-semibold">扫码</h1>
      </div>

      {!canUseCamera && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-medium">需要 HTTPS 才能调用摄像头</p>
              <p className="text-muted-foreground text-xs mt-1">
                本地开发（localhost）不受限；线上部署需配置 HTTPS（Caddy 自动证书）。
              </p>
            </div>
          </div>
        </div>
      )}

      {status === "idle" && canUseCamera && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            扫描物品或位置上的二维码，自动跳转到对应页面。
          </p>
          <Button onClick={start} className="w-full">
            <Camera className="size-4" />
            启动摄像头
          </Button>
        </div>
      )}

      {(status === "requesting" || status === "scanning") && (
        <div className="space-y-2">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="size-48 border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">对准二维码…</p>
          <Button onClick={stop} variant="outline" className="w-full">
            取消
          </Button>
        </div>
      )}

      {status === "found" && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">已识别，正在跳转…</div>
      )}

      {(status === "denied" || status === "error" || status === "no-camera") && (
        <div className="rounded-lg border bg-destructive/10 p-4 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
            <p>{errMsg}</p>
          </div>
          <Button onClick={start} variant="outline" className="w-full">
            重试
          </Button>
        </div>
      )}

      <div className="border-t pt-4 space-y-2">
        <p className="text-xs text-muted-foreground">或者直接输入 ID：</p>
        <ManualEntry />
      </div>
    </div>
  )
}

function ManualEntry() {
  const [type, setType] = useState<"item" | "location">("item")
  const [id, setId] = useState("")
  const router = useRouter()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const numId = Number(id)
        if (!Number.isInteger(numId) || numId <= 0) return
        if (type === "item") router.push(`/items/${numId}`)
        else router.push(`/items?loc=${numId}`)
      }}
      className="flex items-center gap-1"
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "item" | "location")}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="item">物品</option>
        <option value="location">位置</option>
      </select>
      <input
        type="number"
        min={1}
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="ID"
        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm min-w-0"
      />
      <Button type="submit" size="sm" disabled={!id}>
        <ArrowRight className="size-4" />
      </Button>
    </form>
  )
}
