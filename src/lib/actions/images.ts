"use server"

import { eq, sql } from "drizzle-orm"
import { unlink, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { db } from "@/lib/db"
import { items, itemImages } from "@/lib/db/schema"
import { requireSession } from "@/lib/auth/session"
import { hasSpaceAccess } from "@/lib/auth/space-access"
import { DeleteItemImageSchema } from "@/lib/validation/schemas"
import {
  MAX_IMAGES_PER_ITEM,
  MAX_IMAGE_BYTES,
  type ActionState,
} from "./types"

const TARGET_LONG_EDGE = 1080
const JPEG_QUALITY = 80

async function userAccessToItemEdit(
  userId: number,
  itemId: number
): Promise<boolean> {
  const [row] = await db
    .select({ spaceId: items.spaceId })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1)
  if (!row) return false
  return hasSpaceAccess(userId, row.spaceId, "editor")
}

/** 把单张图保存到 public/uploads/items/{itemId}/{timestamp}-{rand}.jpg。返回相对路径 `/uploads/items/...` 与字节数。 */
async function saveItemImage(
  itemId: number,
  file: File
): Promise<{ path: string; bytes: number }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`单张图片不能超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`)
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const relDir = path.join("uploads", "items", String(itemId))
  const absDir = path.join(process.cwd(), "public", relDir)
  await mkdir(absDir, { recursive: true })

  // filename 完全跟 sortOrder 解耦，用 timestamp + random 避免跟任何现有 path 冲突
  // (之前用 ${idx}.jpg 在 sortOrder 重排 + 删图后, nextIdx 可能跟已有 row.path 冲突,
  // writeFile 直接覆盖别人的图 —— v1.2.2 实测导致 "上传一张新图, 别人的图也被替换" bug)
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const absPath = path.join(absDir, filename)
  const relPath = "/" + path.posix.join(relDir, filename).replace(/\\/g, "/")

  const out = await sharp(buf)
    .rotate() // 按 EXIF 自动旋转
    .resize({
      width: TARGET_LONG_EDGE,
      height: TARGET_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  await writeFile(absPath, out.data)

  return { path: relPath, bytes: out.info.size }
}

/** 处理 FormData 中的 images[]，追加到 item 末尾（id 顺序自增）。返回新写入的 count。 */
export async function uploadItemImages(
  itemId: number,
  formData: FormData
): Promise<number> {
  const user = await requireSession()
  if (!(await userAccessToItemEdit(user.id, itemId))) {
    throw new Error("无权操作该物品")
  }

  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return 0

  const [countRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(itemImages)
    .where(eq(itemImages.itemId, itemId))
  const existing = countRow?.c ?? 0
  const slots = MAX_IMAGES_PER_ITEM - existing
  if (slots <= 0) throw new Error(`单物品最多 ${MAX_IMAGES_PER_ITEM} 张图`)
  if (files.length > slots) {
    throw new Error(
      `还能上传 ${slots} 张图（已上传 ${existing}，最多 ${MAX_IMAGES_PER_ITEM}）`
    )
  }

  // 查 max(sortOrder) 确定起始 idx
  const [maxRow] = await db
    .select({ m: sql<number>`coalesce(max(${itemImages.sortOrder}), -1)` })
    .from(itemImages)
    .where(eq(itemImages.itemId, itemId))
  let nextIdx = (maxRow?.m ?? -1) + 1

  for (const file of files) {
    const saved = await saveItemImage(itemId, file)
    await db.insert(itemImages).values({
      itemId,
      path: saved.path,
      sortOrder: nextIdx,
    })
    nextIdx += 1
  }
  return files.length
}

export async function deleteItemImageAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSession()
  const parsed = DeleteItemImageSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { error: "参数错误" }
  const { id } = parsed.data

  const [img] = await db
    .select({ id: itemImages.id, itemId: itemImages.itemId, path: itemImages.path })
    .from(itemImages)
    .where(eq(itemImages.id, id))
    .limit(1)
  if (!img) return { error: "图片不存在" }
  if (!(await userAccessToItemEdit(user.id, img.itemId))) {
    return { error: "无权操作" }
  }

  const absPath = path.join(process.cwd(), "public", img.path.replace(/^\//, ""))
  if (existsSync(absPath)) {
    try {
      await unlink(absPath)
    } catch {
      // ignore
    }
  }
  await db.delete(itemImages).where(eq(itemImages.id, id))
  return { ok: true }
}
