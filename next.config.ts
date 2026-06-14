import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Action 接收的请求体大小上限。Next.js 默认 1MB,上传图片必超。
  // 跟反代示例的 client_max_body_size 20M 对齐：够单张 10MB 图 + 1~2 张余量。
  // 一次想传更多图就把两边都调大;Nage 应用层 MAX_IMAGE_BYTES(单张 10MB)、
  // MAX_IMAGES_PER_ITEM(单物品 9 张)仍会先兜底校验。
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
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

export default nextConfig;
