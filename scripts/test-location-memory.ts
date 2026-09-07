// 验证两个添加物品弹窗的位置选择是否记住上次选择（localStorage 共享）
// 运行：node node_modules/tsx/dist/cli.mjs scripts/test-location-memory.ts

import { chromium } from "playwright"

const BASE = "http://localhost:3000"
const USER = "admin"
const PASS = "eo3ji3fu"

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)
}

/** 锁定 Radix dialog（排除 Next.js dev error overlay 也带 role=dialog） */
function dialogLocator(page: import("playwright").Page) {
  return page.locator('[data-slot="dialog-content"]')
}

/** 找 dialog 里位置 picker 的 trigger：用 <label>位置</label> 锚定，再找父节点里的 combobox */
function locationTrigger(page: import("playwright").Page) {
  return dialogLocator(page)
    .locator('xpath=.//label[normalize-space()="位置"]/..//*[@role="combobox"]')
    .first()
}

async function getSelectedLabel(page: import("playwright").Page): Promise<string | null> {
  const trigger = locationTrigger(page)
  await trigger.waitFor({ state: "visible" })
  const text = (await trigger.textContent())?.trim() ?? ""
  if (text.includes("不选")) return null
  return text
}

async function pickNthLocation(page: import("playwright").Page, n = 0): Promise<string> {
  await locationTrigger(page).click()
  // 等 popover 的 tree items 出现（popper portal 在 dialog 外，所以用 page-wide locator）
  const treeItems = page
    .locator('button.flex-1.text-left.truncate')
    .filter({ hasNotText: "不选" })
  await treeItems.first().waitFor({ state: "visible" })
  const realNode = treeItems.nth(n)
  const label = (await realNode.textContent())?.trim() ?? ""
  await realNode.click()
  return label
}

async function openDialogA(page: import("playwright").Page) {
  await page.click('button[aria-label="添加物品"]')
  await dialogLocator(page).filter({ hasText: "快速添加物品" }).waitFor({ state: "visible" })
}

async function closeDialogA(page: import("playwright").Page) {
  await page.keyboard.press("Escape")
  await dialogLocator(page).filter({ hasText: "快速添加物品" }).waitFor({ state: "hidden" })
}

async function openDialogB(page: import("playwright").Page) {
  await page.click('button:has-text("添加物品")')
  await dialogLocator(page).filter({ hasText: "记录收纳物品" }).waitFor({ state: "visible" })
}

async function closeDialogB(page: import("playwright").Page) {
  await page.keyboard.press("Escape")
  await dialogLocator(page).filter({ hasText: "记录收纳物品" }).waitFor({ state: "hidden" })
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    channel: "chrome",
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`))

  try {
    // 1. 登录
    log("1. 登录")
    await page.goto(`${BASE}/login`)
    await page.fill('input[name="username"]', USER)
    await page.fill('input[name="password"]', PASS)
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ])
    log(`   登录后跳转到：${page.url()}`)

    // 2. 清理 localStorage
    log("2. 清理 localStorage")
    await page.evaluate(() => localStorage.removeItem("nage-last-add-location"))

    // ============================================================
    // Dialog A：quick-add FAB
    // ============================================================
    log("==== Dialog A：quick-add FAB ====")

    log("3. 点 FAB 打开 quick-add 弹窗")
    await page.click('button[aria-label="添加物品"]')
    await page.waitForSelector('text=快速添加物品', { state: "visible" })

    let selected = await getSelectedLabel(page)
    log(`   第一次打开选中：${selected === null ? "（无，符合预期）" : selected}`)
    if (selected !== null) throw new Error("❌ 第一次打开应该有位置，但发现已选中")

    const pickedA = await pickNthLocation(page, 0)
    log(`5. 选了：${pickedA}`)

    const stored1 = await page.evaluate(() => localStorage.getItem("nage-last-add-location"))
    log(`   localStorage: ${stored1}`)
    if (!stored1) throw new Error("❌ localStorage 没写入")

    log("7. 关闭弹窗")
    await page.keyboard.press("Escape")
    await page.waitForSelector('text=快速添加物品', { state: "hidden" })

    log("8. 再次打开 quick-add 弹窗")
    await page.click('button[aria-label="添加物品"]')
    await page.waitForSelector('text=快速添加物品', { state: "visible" })
    selected = await getSelectedLabel(page)
    log(`   第二次打开选中：${selected === null ? "（无）" : selected}`)
    if (selected === null) throw new Error("❌ Dialog A：第二次打开应该记住上次选择")
    if (selected !== pickedA) throw new Error(`❌ Dialog A：记住了不同的位置 ${selected} ≠ ${pickedA}`)
    log("✅ Dialog A 通过：记住了位置")

    await page.screenshot({ path: "scripts/.smoke-dialog-a.png" })
    await page.keyboard.press("Escape")
    await page.waitForSelector('text=快速添加物品', { state: "hidden" })

    // ============================================================
    // Dialog B：items 页 + 添加物品
    // ============================================================
    log("==== Dialog B：items 页 + 添加物品 ====")

    log("10. 导航到 /items")
    await page.goto(`${BASE}/items`)
    await page.waitForSelector('button:has-text("添加物品")', { state: "visible" })

    log("11. 点「添加物品」")
    await page.click('button:has-text("添加物品")')
    await page.waitForSelector('text=记录收纳物品', { state: "visible" })

    selected = await getSelectedLabel(page)
    log(`   Dialog B 打开后位置选中：${selected === null ? "（无）" : selected}`)
    if (selected === null) throw new Error("❌ Dialog B：应该跟 Dialog A 共享 localStorage 记忆")
    if (selected !== pickedA) throw new Error(`❌ Dialog B：记住了不同的位置 ${selected} ≠ ${pickedA}`)
    log("✅ Dialog B 通过：跟 Dialog A 共享记忆")

    log("13. 在 Dialog B 里换个位置")
    const secondLabel = await pickNthLocation(page, 1)
    log(`   换了：${secondLabel}`)
    if (secondLabel === pickedA) throw new Error("❌ pickNth(1) 选到了同一个位置")

    const stored2 = await page.evaluate(() => localStorage.getItem("nage-last-add-location"))
    log(`   localStorage 现在：${stored2}`)
    if (stored2 === stored1) throw new Error("❌ Dialog B 选不同位置但 localStorage 没变")

    log("14. 关 → 重开 Dialog B")
    await page.keyboard.press("Escape")
    await page.waitForSelector('text=记录收纳物品', { state: "hidden" })
    await page.click('button:has-text("添加物品")')
    await page.waitForSelector('text=记录收纳物品', { state: "visible" })
    selected = await getSelectedLabel(page)
    log(`   重开后选中：${selected === null ? "（无）" : selected}`)
    // picker 可能显示完整路径"客厅 / 电视柜"，所以包含关系校验
    if (selected == null || !selected.includes(secondLabel)) {
      throw new Error(`❌ Dialog B 重开应记住包含 ${secondLabel}，但看到 ${selected}`)
    }
    log("✅ Dialog B 重开通过")

    // ============================================================
    // 跨 dialog 验证：再开 Dialog A 应该记住 secondLabel
    // ============================================================
    log("==== Dialog A 跨 dialog 验证 ====")
    await page.keyboard.press("Escape")
    await page.waitForSelector('text=记录收纳物品', { state: "hidden" })

    log("15. 再开 Dialog A 应该记住 Dialog B 选的 " + secondLabel)
    await page.click('button[aria-label="添加物品"]')
    await dialogLocator(page).filter({ hasText: "快速添加物品" }).waitFor({ state: "visible" })
    selected = await getSelectedLabel(page)
    log(`   Dialog A 选中：${selected === null ? "（无）" : selected}`)
    if (selected == null || !selected.includes(secondLabel)) {
      throw new Error(`❌ Dialog A 应记住包含 ${secondLabel}，但看到 ${selected}`)
    }
    log("✅ 跨 dialog 共享通过")

    await page.screenshot({ path: "scripts/.smoke-dialog-b.png" })

    log("==== 全部通过 ====")
    if (consoleErrors.length) {
      log(`⚠️ console 报错 ${consoleErrors.length} 条（前 3 条）：`)
      consoleErrors.slice(0, 3).forEach((e) => log(`   ${e.slice(0, 200)}`))
    }
  } catch (err) {
    log(`❌ 测试失败：${err instanceof Error ? err.message : String(err)}`)
    await page.screenshot({ path: "scripts/.smoke-failure.png", fullPage: true })
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

run()