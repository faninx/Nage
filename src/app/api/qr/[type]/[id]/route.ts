import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { db } from "@/lib/db"
import { items, locations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ type: string; id: string }> }

/**
 * GET /api/qr/[type]/[id]
 * type: "item" | "location"
 * id: 物品/位置 id
 * 二维码内容 = {origin}/scan?type=item&id=X
 */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await requireSession()
  const { type, id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 })
  }

  let spaceId: number | null = null
  if (type === "item") {
    const [row] = await db
      .select({ spaceId: items.spaceId })
      .from(items)
      .where(eq(items.id, id))
      .limit(1)
    spaceId = row?.spaceId ?? null
  } else if (type === "location") {
    const [row] = await db
      .select({ spaceId: locations.spaceId })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1)
    spaceId = row?.spaceId ?? null
  }
  if (spaceId == null) {
    return NextResponse.json({ error: "不存在或无权访问" }, { status: 404 })
  }
  if (!(await hasSpaceAccess(user.id, spaceId, "viewer"))) {
    return NextResponse.json({ error: "不存在或无权访问" }, { status: 404 })
  }

  // 反代后 QR 里的 origin 用 PUBLIC_URL（去掉尾部 /），未设则降级到 request origin
  // 兼容形式：https://x.com / https://x.com/ / https://x.com:8443 / https://x.com:8443/
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/+$/, "")
  const origin = publicUrl || req.nextUrl.origin
  const target = `${origin}/scan?type=${type}&id=${id}`
  const png = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 480,
    color: { dark: "#000000", light: "#ffffff" },
  })
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    },
  })
}
