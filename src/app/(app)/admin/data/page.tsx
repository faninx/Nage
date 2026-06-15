import { requireSession } from "@/lib/auth/session"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Database } from "lucide-react"
import { DataManagementClient } from "./data-client"
import { getCurrentSpaceId, hasSpaceAccess } from "@/lib/auth/space-access"
import { db } from "@/lib/db"
import { spaces } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

export default async function AdminDataPage() {
  const me = await requireSession()
  const sid = await getCurrentSpaceId(me.id)
  // 仅当前空间的 owner / editor 可进入；route 还会再校验一次
  if (!(await hasSpaceAccess(me.id, sid, "editor"))) redirect("/")
  const [space] = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, sid))
    .limit(1)
  if (!space) redirect("/")

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
            导出当前空间「{space.name}」的全量数据为 JSON 文件（含位置、分类、标签、物品和图片路径）。
            导入会先清空该空间，再写入。图片二进制需从 public/uploads/ 单独恢复。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataManagementClient spaceId={space.id} spaceName={space.name} />
        </CardContent>
      </Card>
    </div>
  )
}
