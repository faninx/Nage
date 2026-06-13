/**
 * Next.js 启动钩子：首次启动时建管理员 + 生成 JWT_SECRET。
 * 详见 https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // 仅在 Node.js runtime 执行
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { ensureBootstrap } = await import("@/lib/auth/bootstrap")
  const result = await ensureBootstrap()

  if (result.created && result.username && result.password) {
    console.log(
      "\n┌────────────────────────────────────────────────────────────┐"
    )
    console.log(
      "│  🔐 纳格管理员已创建（首次启动）                                │"
    )
    console.log(
      "├────────────────────────────────────────────────────────────┤"
    )
    console.log(
      `│  用户名: ${result.username.padEnd(50)}│`
    )
    console.log(
      `│  密码:   ${result.password.padEnd(50)}│`
    )
    console.log(
      "│                                                            │"
    )
    console.log(
      "│  ⚠️  请立即登录后修改密码！                                  │"
    )
    if (result.password === process.env.ADMIN_PASSWORD) {
      console.log(
        "│  密码来自 .env.local（ADMIN_PASSWORD）                       │"
      )
    } else {
      console.log(
        "│  密码是随机生成的，已写入 .env.local                        │"
      )
    }
    console.log(
      "└────────────────────────────────────────────────────────────┘\n"
    )
  }

  if (result.jwtSecretGenerated) {
    console.log(
      "🔑 JWT_SECRET 已自动生成并写入 .env.local（重启后保持一致）"
    )
  }

  // 校验 PUBLIC_URL（公网通过反代访问时必须设，否则 QR 码指向 localhost）
  const publicUrl = process.env.PUBLIC_URL
  if (publicUrl) {
    try {
      const u = new URL(publicUrl)
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        console.warn(
          `⚠️  PUBLIC_URL 协议异常: ${publicUrl}（建议 http:// 或 https://）`
        )
      }
    } catch {
      console.warn(
        `⚠️  PUBLIC_URL 格式无效: ${publicUrl}（应该是 https://your-domain.com 这样的完整 URL）`
      )
    }
  } else {
    console.warn(
      "⚠️  PUBLIC_URL 未设置 — QR 二维码会指向 localhost,生产环境(反代后)请在 .env 配 PUBLIC_URL=https://你的域名"
    )
  }
}
