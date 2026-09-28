/**
 * Scroll regression check.
 *
 * Guards the fix for the landing page becoming unscrollable. The
 * shell CSS locks the document for the terminal, and that lock was
 * global, so any page without the shell could not be scrolled at
 * all. This asserts both halves of the intended behaviour rather
 * than only the case that was broken: landing must scroll, terminal
 * document must stay locked with its own inner scroller.
 */

const { chromium } = require("playwright")

const BASE = process.env.BASE_URL || "http://localhost:3000"

async function main() {
  const browser = await chromium.launch()
  const results = []

  // --- Landing page must scroll the document ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(1200)

    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => window.scrollY)

    const max = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    )
    const hasShell = await page.evaluate(() =>
      Boolean(document.querySelector(".zeks-shell"))
    )

    results.push({
      page: "/",
      expect: "document scrolls",
      scrollY: `${before} -> ${after}`,
      scrollable: `${max}px`,
      hasShell,
      pass: after > before,
    })
    await page.close()
  }

  // --- Terminal must keep the document locked ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(`${BASE}/terminal`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(1800)

    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => window.scrollY)

    const bodyOverflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow
    )
    const mainScrolls = await page.evaluate(() => {
      const m = document.querySelector(".zeks-shell-main")
      return m ? m.scrollHeight > m.clientHeight : false
    })

    results.push({
      page: "/terminal",
      expect: "document locked, inner scroller scrolls",
      scrollY: `${before} -> ${after}`,
      bodyOverflow,
      mainScrolls,
      pass: after === before && bodyOverflow === "hidden",
    })
    await page.close()
  }

  // --- Anchor navigation must reach the launchpad ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(800)
    await page.click('a[href="#launch"]')
    await page.waitForTimeout(1000)
    const y = await page.evaluate(() => window.scrollY)
    const visible = await page.isVisible("#launch")
    results.push({
      page: "/ #launch",
      expect: "anchor scrolls to launchpad",
      scrollY: y,
      visible,
      pass: visible && y > 100,
    })
    await page.close()
  }

  await browser.close()

  let failed = 0
  console.log("")
  for (const r of results) {
    if (!r.pass) failed++
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.page}`)
    console.log(`      expect: ${r.expect}`)
    for (const [k, v] of Object.entries(r)) {
      if (k === "pass" || k === "page" || k === "expect") continue
      console.log(`      ${k}: ${v}`)
    }
    console.log("")
  }
  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
