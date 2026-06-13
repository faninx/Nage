import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireSession } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { items, locations, spaces } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

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

  let ok = false
  if (type === "item") {
    const [row] = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(spaces, eq(items.spaceId, spaces.id))
      .where(and(eq(items.id, id), eq(spaces.ownerId, user.id)))
      .limit(1)
    ok = !!row
  } else if (type === "location") {
    const [row] = await db
      .select({ id: locations.id })
      .from(locations)
      .innerJoin(spaces, eq(locations.spaceId, spaces.id))
      .where(and(eq(locations.id, id), eq(spaces.ownerId, user.id)))
      .limit(1)
    ok = !!row
  }
  if (!ok) {
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
