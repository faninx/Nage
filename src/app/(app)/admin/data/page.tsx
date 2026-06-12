import { requireAdmin } from "@/lib/auth/session"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Database } from "lucide-react"
import { DataManagementClient } from "./data-client"

export default async function AdminDataPage() {
  await requireAdmin()
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Database className="size-5" />
        <h1 className="text-xl font-semibold">数据管理</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">备份与恢复</CardTitle>
          <CardDescription>
            导出当前空间的全量数据为 JSON 文件（含位置、分类、标签、物品和图片路径）。
            导入会先清空当前空间，再写入。图片二进制需从 public/uploads/ 单独恢复。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataManagementClient />
        </CardContent>
      </Card>
    </div>
  )
}
