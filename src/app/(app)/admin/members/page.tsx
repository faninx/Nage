import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { MembersClient } from "./members-client"

export default async function MembersPage() {
  const me = await requireAdmin()

  const list = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))

  return <MembersClient currentUserId={me.id} initial={list} />
}
