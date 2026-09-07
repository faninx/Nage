import { chromium } from "playwright"
async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], channel: "chrome" })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto("http://localhost:3000/login")
  await page.fill('input[name="username"]', "admin")
  await page.fill('input[name="password"]', "eo3ji3fu")
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ])
  // 测 /items 页面（有 FilterBar + 列表，PC 视口）
  await page.goto("http://localhost:3000/items")
  await page.waitForSelector("text=物品", { state: "visible" })

  // 检查 sidebar computed style
  const sidebar = page.locator("aside").first()
  const beforeScroll = await sidebar.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      position: cs.position,
      top: cs.top,
      alignSelf: cs.alignSelf,
      rect: el.getBoundingClientRect().top,
    }
  })
  console.log("滚动前:", beforeScroll)

  // 强制把页面加长（塞几个 items 让页面够长）。或者直接 window.scrollTo
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(200)

  const afterScroll = await sidebar.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      position: cs.position,
      top: cs.top,
      alignSelf: cs.alignSelf,
      rect: el.getBoundingClientRect().top,
    }
  })
  console.log("滚动后:", afterScroll)

  // 截图证据
  await page.screenshot({ path: "scripts/.sidebar-scrolled.png", fullPage: false })

  // 断言：滚动后 sidebar 仍在视口顶部（≤ header 高度 56px）
  if (afterScroll.rect > 80) {
    console.log(`❌ 侧栏滚走了，top=${afterScroll.rect}`)
    process.exit(1)
  }
  if (afterScroll.position !== "sticky") {
    console.log(`❌ 侧栏 position 不是 sticky`)
    process.exit(1)
  }
  console.log("✅ 侧栏 sticky 生效")
  await browser.close()
}
main()