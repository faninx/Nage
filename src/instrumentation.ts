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
}
