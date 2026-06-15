import { redirect } from "next/navigation"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { db } from "@/lib/db"
import { spaceMembers, users, spaces } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { SpaceSettingsClient, type MemberRow } from "./space-settings-client"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export default async function SpaceSettingsPage({ params }: Params) {
  const me = await requireSession()
  const { id: idStr } = await params
  const spaceId = Number(idStr)
  if (!Number.isInteger(spaceId) || spaceId <= 0) redirect("/")

  if (!(await hasSpaceAccess(me.id, spaceId, "owner"))) {
    redirect("/")
  }

  const [space] = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1)
  if (!space) redirect("/")

  const rows = await db
    .select({
      userId: spaceMembers.userId,
      role: spaceMembers.role,
      createdAt: spaceMembers.createdAt,
      username: users.username,
      nickname: users.nickname,
      isActive: users.isActive,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(asc(spaceMembers.createdAt))
  const members: MemberRow[] = rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    nickname: r.nickname,
    role: r.role,
    isActive: r.isActive,
    joinedAt: r.createdAt.toISOString(),
  }))

  return (
    <SpaceSettingsClient
      spaceId={spaceId}
      spaceName={space.name}
      currentUserId={me.id}
      initial={members}
    />
  )
}
