const { chromium } = require("playwright")

const BASE = "http://localhost:3000"

async function main() {
  const browser = await chromium.launch()
  const results = []
  const record = (name, pass, detail) => results.push({ name, pass, detail })

  // 1. /launchpad renders
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const resp = await page.goto(`${BASE}/launchpad`, {
      waitUntil: "networkidle",
      timeout: 90000,
    })
    await page.waitForTimeout(1000)
    const status = resp.status()
    const hasForm = await page.isVisible("#launch-name").catch(() => false)
    const hasBack = await page.isVisible('a[href="/"]').catch(() => false)
    record(
      "/launchpad renders",
      status === 200 && hasForm,
      `status=${status} form=${hasForm} backLink=${hasBack}`
    )
    await page.screenshot({ path: ".tmp-launchpad-page.png", fullPage: true })
    await page.close()
  }

  // 2. landing no longer carries the launchpad section
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(900)
    const hasSection = await page.isVisible("#launch-name").catch(() => false)
    const hasAnchor = await page.isVisible("#launch").catch(() => false)
    const marketsStill = await page.isVisible("#markets").catch(() => false)
    record(
      "landing no longer embeds launchpad",
      !hasSection && !hasAnchor && marketsStill,
      `form=${hasSection} anchor=${hasAnchor} marketsStill=${marketsStill}`
    )
    await page.close()
  }

  // 3. header Launch link navigates to /launchpad
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(800)
    await page.click('nav a[href="/launchpad"]')
    await page.waitForURL("**/launchpad", { timeout: 20000 })
    await page.waitForTimeout(700)
    const url = page.url()
    const onPage = await page.isVisible("#launch-name").catch(() => false)
    record(
      "header Launch navigates to /launchpad",
      url.endsWith("/launchpad") && onPage,
      `url=${url.replace(BASE, "")} form=${onPage}`
    )
    await page.close()
  }

  // 4. launchpad colours match the terminal, not a third palette
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const read = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 90000 })
      await page.waitForTimeout(1200)
      return page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement)
        return {
          bg: cs.getPropertyValue("--background").trim().toLowerCase(),
          fg: cs.getPropertyValue("--foreground").trim().toLowerCase(),
          primary: cs.getPropertyValue("--primary").trim().toLowerCase(),
          border: cs.getPropertyValue("--border").trim().toLowerCase(),
        }
      })
    }
    const launchpad = await read("/launchpad")
    const terminal = await read("/terminal")
    const same =
      launchpad.bg === terminal.bg &&
      launchpad.fg === terminal.fg &&
      launchpad.primary === terminal.primary
    record(
      "launchpad palette == terminal palette",
      same,
      `launchpad=${JSON.stringify(launchpad)} terminal=${JSON.stringify(terminal)}`
    )
    await page.close()
  }

  // 5. back link returns to the landing page
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(`${BASE}/launchpad`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(700)
    await page.click('a[href="/"]')
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 })
    await page.waitForTimeout(600)
    const onLanding = await page.isVisible("#markets").catch(() => false)
    record("back link returns to landing", onLanding, `url=${page.url().replace(BASE, "")}`)
    await page.close()
  }

  // 6. validation still refuses an empty submit
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(`${BASE}/launchpad`, { waitUntil: "networkidle", timeout: 90000 })
    await page.waitForTimeout(700)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(500)
    const alert = await page.isVisible('[role="alert"]').catch(() => false)
    const text = alert
      ? await page.textContent('[role="alert"]')
      : ""
    record(
      "empty submit blocked with a reason",
      alert,
      String(text || "").trim().slice(0, 70)
    )
    await page.close()
  }

  await browser.close()

  let failed = 0
  console.log("")
  for (const r of results) {
    if (!r.pass) failed++
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`)
    console.log(`      ${r.detail}`)
    console.log("")
  }
  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
