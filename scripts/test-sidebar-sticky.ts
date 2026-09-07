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

  // 检查 sidebar computed style + 几何尺寸
  const sidebar = page.locator("aside").first()
  const measure = (el: Element) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      position: cs.position,
      top: cs.top,
      alignSelf: cs.alignSelf,
      rectTop: r.top,
      height: r.height,
      viewport: window.innerHeight,
    }
  }
  const beforeScroll = await sidebar.evaluate(measure)
  console.log("滚动前:", beforeScroll)
  // 断言：sidebar 高度 = 视口 - header（=56px），即填满整个左侧
  const expectedH = beforeScroll.viewport - 56
  if (Math.abs(beforeScroll.height - expectedH) > 1) {
    console.log(`❌ sidebar 高度 ${beforeScroll.height} ≠ 理论 ${expectedH}`)
    process.exit(1)
  }
  if (beforeScroll.position !== "sticky") {
    console.log(`❌ sidebar position 不是 sticky`)
    process.exit(1)
  }

  // 滚动 600px 后再看 sidebar 位置（应该不变）
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(200)
  const afterScroll = await sidebar.evaluate(measure)
  console.log("滚动后:", afterScroll)

  if (Math.abs(afterScroll.rectTop - beforeScroll.rectTop) > 1) {
    console.log(`❌ 滚动后 sidebar 跑位：${beforeScroll.rectTop} → ${afterScroll.rectTop}`)
    process.exit(1)
  }
  console.log("✅ 侧栏 sticky + 100% 高 双断言通过")
  await browser.close()
}
main()