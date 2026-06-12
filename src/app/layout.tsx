import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "@/components/ui/sonner"
import { ThemeScript } from "@/components/layout/theme-script"
import "./globals.css"

export const metadata: Metadata = {
  title: "纳格 · 收纳管理",
  description: "一个轻量、自托管的物品收纳管理系统",
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
      <body className="min-h-full flex flex-col">
        <ThemeScript />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
