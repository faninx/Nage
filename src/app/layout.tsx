import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "纳格 · 收纳管理",
  description: "一个轻量、自托管的物品收纳管理系统",
  // PWA manifest（next-pwa 生成 public/manifest.json，这里 link 让浏览器发现）
  manifest: "/manifest.json",
  // iOS / 桌面 web app
  applicationName: "Nage",
  appleWebApp: {
    capable: true,
    title: "Nage",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
}

export const viewport: Viewport = {
  // PWA: 缩放关掉，状态栏色跟系统主题走（Android Chrome / iOS Safari 都认 media-query 形式）
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  colorScheme: "light dark",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN" suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        {/* PWA 补充：next-pwa 会在 build 时生成 <link rel="manifest">，但 iOS 需要单独 link apple-touch-icon */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        {/* next-themes ThemeProvider 替代手写 ThemeScript：
            - 自带 FOUC 防止脚本（canonical 模式）
            - 完整处理 React 19 hydration / 嵌套 layout / 服务工作者缓存
            - storageKey 沿用 'nage-theme' 保持用户已有 localStorage 不丢
            - attribute="class" 用 .dark 类，跟 Tailwind v4 @custom-variant dark 兼容
            - 默认 light/dark/system 三档；之前手写 script 跟 toggle 都是这三档 */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="nage-theme"
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
