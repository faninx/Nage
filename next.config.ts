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
  // sharp / better-sqlite3 / bindings 是原生模块,Next.js 静态分析追踪不到 native binding,
  // 必须手动声明才会被包含进 standalone 输出,否则启动时报找不到模块。
  // 注意：之前 ./node_modules/bindings/**/* 不生效 — pnpm 把 dependencies 装到 .pnpm/ 下,
  // 但顶层 node_modules/<name> 是符号链接 (symlink) 到 .pnpm/<name>@x.y.z/node_modules/<name>。
  // outputFileTracingIncludes 似乎不 hoist 符号链接目标。
  // 解决：让 pnpm 把依赖平铺到顶层（hoist=true），然后用顶层路径引用。
  // 或者直接复制需要的 .pnpm 目录：
  outputFileTracingIncludes: {
    "/": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/better-sqlite3/**/*",
      // bindings 实际位于 .pnpm/bindings@1.5.0/node_modules/bindings/；
      // 显式 include 它的所有内容
      "./node_modules/.pnpm/bindings@1.5.0/**/*",
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
};

export default withPWA(nextConfig);
