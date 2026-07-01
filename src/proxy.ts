import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SESSION_COOKIE = "nage_session"

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/mcp"]

function getSecret(): Uint8Array | null {
  const raw = process.env.JWT_SECRET
  if (!raw || raw.length < 32) return null
  return new TextEncoder().encode(raw)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 放行静态资源和 Next 内部
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.json" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/uploads/") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  // 公开路径
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const secret = getSecret()

  // 没有 JWT_SECRET（首次启动还没 bootstrap）→ 放行到 /login 让用户看到登录页
  if (!secret) {
    if (pathname !== "/login") {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (!token) {
    return redirectToLogin(request)
  }

  try {
    await jwtVerify(token, secret, { algorithms: ["HS256"] })
    return NextResponse.next()
  } catch {
    return redirectToLogin(request)
  }
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search)
  const res = NextResponse.redirect(url)
  res.cookies.delete(SESSION_COOKIE)
  return res
}

export const config = {
  matcher: [
    /*
     * 匹配所有请求除了：
     * - _next/static
     * - _next/image
     * - favicon
     * - 任何包含点的路径（如 image.svg）
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
}
