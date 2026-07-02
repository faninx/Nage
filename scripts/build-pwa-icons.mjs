// Build PWA icons from public/icons/icon.svg
// 生成 192×192 / 512×512 / maskable 512×512 三个 PNG
// 用法: node scripts/build-pwa-icons.mjs
//
// icon-512.png: 标准 PWA 图标
// icon-192.png: 小尺寸（Android Chrome 任务栏）
// icon-maskable-512.png: Android 自适应图标（safe zone 中心 80%）

import sharp from "sharp"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const svgPath = path.resolve(__dirname, "..", "public", "icons", "icon.svg")
const outDir = path.dirname(svgPath)

const svg = readFileSync(svgPath)

async function generate() {
  // 1) 192×192 普通图标
  await sharp(svg).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"))
  console.log("✓ icon-192.png")

  // 2) 512×512 普通图标
  await sharp(svg).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"))
  console.log("✓ icon-512.png")

  // 3) 512×512 maskable 图标（safe zone 中心 80%）
  //    做法：在原 SVG 外加 padding 圈住，文字 / 图形缩到 80% 内
  //    Android 系统会按 mask 裁剪外圈 12.5%，所以中心 75% 一定可见
  const paddedSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f172a"/>
  <g transform="scale(0.8) translate(64, 64)">
    <rect width="512" height="512" rx="96" ry="96" fill="#0f172a"/>
    <rect x="332" y="332" width="120" height="120" rx="20" ry="20" fill="#1e293b"/>
    <text x="116" y="392" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="380" font-weight="800" fill="#f8fafc" text-anchor="middle" letter-spacing="-12">N</text>
    <circle cx="416" cy="416" r="28" fill="#22c55e"/>
  </g>
</svg>
  `)
  await sharp(paddedSvg)
    .resize(512, 512)
    .png()
    .toFile(path.join(outDir, "icon-maskable-512.png"))
  console.log("✓ icon-maskable-512.png")

  // 4) favicon 用 32×32（更小）
  await sharp(svg).resize(32, 32).png().toFile(path.resolve(__dirname, "..", "src", "app", "icon.png"))
  console.log("✓ src/app/icon.png (32×32)")
}

generate().catch((e) => {
  console.error(e)
  process.exit(1)
})
