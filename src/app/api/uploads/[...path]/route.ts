import { NextResponse, type NextRequest } from "next/server"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { items } from "@/lib/db/schema"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { resolveMcpAuth } from "@/lib/auth/mcp-auth"

// uploads/ 在 data/ 下（不在 public/），这样 Next.js dev 模式不会从 public/ 静态服务
// → 所有请求都走到这个 route handler → 鉴权生效
const UPLOADS_DIR = path.resolve(process.cwd(), "data", "uploads")

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
}

/**
 * 简单的 LRU 缓存：(itemId → spaceId)
 * 避免每张图都查 items 表。item 不常换空间（通常一次创建就不动），
 * 简单按容量限制 + 清空，不做精细 LRU。
 */
const _spaceCache = new Map<number, number>()
const CACHE_MAX = 5000

async function getItemSpaceId(itemId: number): Promise<number | null> {
  const cached = _spaceCache.get(itemId)
  if (cached !== undefined) return cached
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1)
  if (!row) return null
  if (_spaceCache.size >= CACHE_MAX) _spaceCache.clear() // 满了就清空
  _spaceCache.set(itemId, row.spaceId)
  return row.spaceId
}

/**
 * GET /uploads/<...path>  →  /api/uploads/<...path>  (next.config.ts rewrite)
 *
 * 为什么不直接靠 Next.js 的 public/ 静态服务:
 * Next.js 16 (Turbopack) production server 在启动时**一次性**扫 public/ 建文件清单,
 * 启动后新加的文件不会被服务,导致用户上传后图片 404。
 * rewrite 优先级在 public/ 之前,所以这条路由会接管所有 /uploads/* 请求,
 * 每次都去磁盘读最新文件,绕开启动扫描。
 *
 * **鉴权（M10 安全加固）**:
 * 之前的"路径不可预测"假设不成立——itemId 是自增的（1, 2, 3...），
 * 任何人可以枚举 /uploads/items/1/1.jpg、/uploads/items/2/1.jpg 看所有图。
 * 现在加 cookie / Bearer 鉴权 + 空间级 hasSpaceAccess(viewer) 校验：
 * - 无 auth → 401
 * - 已 auth 但不是该空间成员 → 403
 * - 空间成员 → 200 + 文件
 * - 不是 items 路径（如 /uploads/avatars/...）→ 404（暂不开放）
 *
 * 性能：itemId → spaceId 走内存缓存，命中 ~0ms；未命中 ~3ms（1 DB 查询）
 * 典型 Web 页面加载 10-20 张图，热图全缓存，总延迟 < 5ms
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  if (!segments || segments.length === 0) {
    return new NextResponse("Not Found", { status: 404 })
  }

  // 防 path traversal: 任一段是 . / .. / 空 / 含 \0 直接拒
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg.includes("\0")) {
      return new NextResponse("Not Found", { status: 404 })
    }
  }

  // 鉴权：cookie 或 Bearer 任一（resolveMcpAuth 已支持）
  const auth = await resolveMcpAuth(request)
  if (!auth) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  // 解析 path: 只支持 items/<itemId>/<file> 模式
  // 其他路径（avatars / categories / etc.）→ 404（暂未实现）
  if (segments[0] !== "items") {
    return new NextResponse("Not Found", { status: 404 })
  }
  const itemId = Number(segments[1])
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return new NextResponse("Not Found", { status: 404 })
  }
  // segments[2] 是文件名（时间戳-rand.jpg），不需要 parse

  // 查 item 所在空间 + 鉴权
  const spaceId = await getItemSpaceId(itemId)
  if (spaceId === null) {
    return new NextResponse("Not Found", { status: 404 })
  }
  if (!(await hasSpaceAccess(auth.userId, spaceId, "viewer"))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  // 物理路径检查（防 path traversal + 限制在 UPLOADS_DIR 内）
  const requested = path.resolve(UPLOADS_DIR, ...segments)
  if (requested !== UPLOADS_DIR && !requested.startsWith(UPLOADS_DIR + path.sep)) {
    return new NextResponse("Not Found", { status: 404 })
  }

  let st
  try {
    st = await stat(requested)
  } catch {
    return new NextResponse("Not Found", { status: 404 })
  }
  if (!st.isFile()) {
    return new NextResponse("Not Found", { status: 404 })
  }

  // ETag 跟 (size, mtime) 走,文件被覆盖(idx 不变但内容变了)浏览器能拿到新版
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs / 1000).toString(16)}"`
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  const buf = await readFile(requested)
  const mime = MIME[path.extname(requested).toLowerCase()] ?? "application/octet-stream"

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=0, must-revalidate", // 私有：避免 CDN 共享
      "ETag": etag,
      "Last-Modified": new Date(st.mtimeMs).toUTCString(),
      "Content-Length": String(st.size),
    },
  })
}
// DEBUG
