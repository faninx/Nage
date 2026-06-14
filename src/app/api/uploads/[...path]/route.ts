import { NextResponse, type NextRequest } from "next/server"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads")

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
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
 * 不做鉴权:
 * - proxy.ts 早就放行 /uploads/ 了,行为不变
 * - 文件路径在 DB 里、URL 是不可预测的 itemId + idx 组合,等同弱鉴权
 * - 内部网/个人用够;想严格鉴权后面再在前面加 requireSession() 即可
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

  const requested = path.resolve(UPLOADS_DIR, ...segments)
  // 最终路径必须仍在 UPLOADS_DIR 内（resolve 已规范化,这里再防一手）
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
      "Cache-Control": "public, max-age=0, must-revalidate",
      "ETag": etag,
      "Last-Modified": new Date(st.mtimeMs).toUTCString(),
      "Content-Length": String(st.size),
    },
  })
}
