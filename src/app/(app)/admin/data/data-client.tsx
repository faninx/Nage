"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

type Props = {
  spaceId: number
  spaceName: string
}

export function DataManagementClient({ spaceId, spaceName }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [, startImport] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  function handleExport() {
    window.location.href = `/api/admin/export?spaceId=${spaceId}`
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      toast.error("文件过大（>50MB）")
      return
    }
    if (
      !(await confirm({
        title: "确定继续导入？",
        description: `导入会先清空「${spaceName}」内的所有数据，然后写入文件内容。`,
        destructive: true,
        confirmText: "继续导入",
      }))
    ) {
      return
    }
    setImporting(true)
    const text = await file.text()
    startImport(async () => {
      try {
        const res = await fetch(`/api/admin/import?spaceId=${spaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error ?? `导入失败（${res.status}）`)
          return
        }
        toast.success("导入成功")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "导入失败")
      } finally {
        setImporting(false)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleExport} variant="outline">
          <Download className="size-4" />
          导出「{spaceName}」为 JSON
        </Button>
        <Button
          onClick={handleImportClick}
          variant="outline"
          disabled={importing}
        >
          <Upload className="size-4" />
          {importing ? "导入中…" : "导入 JSON"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="flex items-start gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
          <span>导入操作不可撤销，请先导出当前数据作为备份。</span>
        </p>
        <p className="flex items-start gap-1.5">
          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-green-500" />
          <span>图片二进制文件需手动从 public/uploads/ 复制到目标服务器；JSON 仅含路径引用。</span>
        </p>
      </div>
      {confirmDialog}
    </div>
  )
}
