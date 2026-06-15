import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NewSpaceClient } from "./new-space-client"
import { requireSession } from "@/lib/auth/session"
import { defaultSpaceName } from "@/lib/actions/types"

export default async function NewSpacePage() {
  const me = await requireSession()
  return (
    <div className="max-w-md mx-auto w-full space-y-4">
      <div className="flex items-center gap-3 px-1">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/" aria-label="返回">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Plus className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">新建空间</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        新建后你将作为该空间的所有者，可以邀请其他成员加入。
      </p>
      <NewSpaceClient defaultName={defaultSpaceName(me.nickname)} />
    </div>
  )
}
