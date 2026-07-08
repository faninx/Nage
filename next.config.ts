import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // 不显式设 disable：用 next-pwa 默认（仅在 production build 启用）
  // workboxOptions 不传：next-pwa webpack plugin 走默认 precache 范围
  // （HTML / CSS / JS / _next/static / icons / manifest）
  // —— API 路由不缓存，命中 PRD F16「写入需联网」
});

const nextConfig: NextConfig = {
  // 启用 standalone 输出:Next.js build 时静态分析所有 import,只把 runtime 实际
  // 用到的文件 + 依赖拷贝到 .next/standalone/,而不是把整个 node_modules 拖进镜像。
  // 估算可省 200-300 MB(node_modules ~656MB → ~100-150MB)。
  output: "standalone",
  // sharp / better-sqlite3 是原生模块,Next.js 静态分析追踪不到 native binding,
  // 必须手动声明才会被包含进 standalone 输出,否则启动时报找不到模块。
  // 注：better-sqlite3 的 transitive dep `bindings` 不被 standalone 自动 hoist,
  // 走 Dockerfile runtime 阶段显式 COPY 解决（pnpm 路径在 outputFileTracingIncludes 不可靠）。
  outputFileTracingIncludes: {
    "/": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/better-sqlite3/**/*",
    ],
  },
  // Server Action 接收的请求体大小上限。Next.js 默认 1MB,上传图片必超。
  // 9 张图最坏情况 = 9 × MAX_IMAGE_BYTES(10MB) = 90MB,留 10MB 余量给文本字段。
  // 一次想传更多图就把两边都调大;Nage 应用层 MAX_IMAGE_BYTES(单张 10MB)、
  // MAX_IMAGES_PER_ITEM(单物品 9 张)仍会先兜底校验。
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // proxy.ts (Next 16 把 middleware 重命名为 proxy) 层 body 大小限制。
    // 独立于 serverActions.bodySizeLimit：proxy 在前，请求先到 proxy 才到 server action。
    // proxy 默认 10MB，多张图总大小超过会被截断 → 下游 server action 收不完整 body
    // → 解析抛 "Unexpected end of form" → Next 整页 500 错误（v1.2.2 实测崩在这）。
    // 必须 ≥ serverActions.bodySizeLimit：100mb 给 9 张 10MB 图留余量。
    // 注意：experimental.middlewareClientMaxBodySize 是这个的已弃用别名，不能两个都设。
    proxyClientMaxBodySize: "100mb",
  },
  // 把 /uploads/* 重写到 /api/uploads/[...path],由 Route Handler 每次读盘服务。
  // 原因:Next.js 16 (Turbopack) production server 启动时一次性扫 public/ 建文件
  // 清单,启动后新加的文件不服务 —— 表现就是用户上传图片保存后 404。
  // rewrite 优先级在 public/ 之前,所以能绕开这个 bug。
  // 详见 src/app/api/uploads/[...path]/route.ts 顶部的注释。
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
    ];
  },

  // 安全响应头：合规 + 浏览器 XSS/CSRF 防护基线。
  // CSP 注释里的来源都按 Nage 实际用法开的，没用到的全禁。
  //   - 'unsafe-inline' for script-src：Next.js 16 hydration + next-themes 防 FOUC
  //     内联脚本需要。nonce 模式更严但 Next 16 还在演进,先 inline 兜底。
  //   - img-src 'self' data: blob:：data/ 是 sharp 处理后 next/image 的占位图格式,
  //     blob: 是 next/image 缩略图 URL。
  //   - frame-ancestors 'none'：替代 X-Frame-Options: DENY（现代浏览器）。
  //   - connect-src 'self'：Server Actions + MCP API + WebSocket(暂无)。
  // HSTS 只在 HTTPS 时设(生产通常反代后是 HTTPS)。dev 走 http 不需要。
  // /api/uploads/* 单独覆盖：default-src 'none' 防 SVG 等执行(我们已经从 MIME 白名单
  // 删了 .svg,这里是 defense-in-depth)。
  async headers() {
    const base = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // Next 16 hydration + next-themes 内联防 FOUC 脚本需要 unsafe-inline
          "script-src 'self' 'unsafe-inline'",
          // shadcn/ui + Radix 部分组件用内联 style
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; "),
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        // 关掉用不到的浏览器能力（camera/mic/geo 等）。Nage 是纯 SSR + 图片存储,
        // 完全不需要这些。
        key: "Permissions-Policy",
        value: [
          "camera=()",
          "microphone=()",
          "geolocation=()",
          "payment=()",
          "usb=()",
          "magnetometer=()",
          "gyroscope=()",
          "accelerometer=()",
        ].join(", "),
      },
    ];

    // uploads 路由:默认拒绝所有,只允许图片格式 + 二进制下载
    const uploadsCsp = [
      "default-src 'none'",
      "img-src 'self'",
      "style-src 'unsafe-inline'", // next/image 缩略图容器偶有 inline style
      "connect-src 'none'",
    ].join("; ");

    return [
      {
        // 全局基础头：所有路由
        source: "/:path*",
        headers: base,
      },
      {
        // uploads 路由额外加固（路由 handler 内部已经鉴权 + 删 .svg MIME，
        // CSP 是 defense-in-depth：即使有人手动塞 SVG/HTML 进 data/uploads/
        // 也不会执行）
        source: "/api/uploads/:path*",
        headers: [
          { key: "Content-Security-Policy", value: uploadsCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "private, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
