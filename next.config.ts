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
};

export default nextConfig;
