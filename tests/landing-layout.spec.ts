import { expect, test } from '@playwright/test'

/**
 * docs/landingsside-gjennomgang.md 4.7: the landing pages use the width of the screen.
 *
 * As the guide writes it, with one change that makes it stricter: a band's width is
 * measured over the things a reader sees (text, pictures, controls: elements with no
 * element children, and images), not over every element. Measured over every element, the
 * band's own full-width container always spans the whole width, and the test could not fail.
 *
 * A band marked data-layout="narrow" is left out; the review report says why.
 */
const pages = ['/', '/lovkrav', '/verneombud', '/smaa-bedrifter', '/bygg-og-anlegg']

for (const path of pages) {
  test(`layout ${path} @1440`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)

    // 1. No horizontal scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, 'horisontal scroll').toBe(false)

    // 2. What each band shows spans at least 75 % of the container (1280 - 2 x 48)
    const MIN = (1280 - 96) * 0.75
    const widths = await page.$$eval('main > section:not([data-layout="narrow"])', (sections) =>
      sections.map((s) => {
        const seen = Array.from(s.querySelectorAll('*')).filter((el) => {
          const r = el.getBoundingClientRect()
          const leaf = el.childElementCount === 0 || el.tagName === 'IMG' || el.tagName === 'svg'
          return leaf && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        })
        const left = Math.min(...seen.map((k) => k.getBoundingClientRect().left))
        const right = Math.max(...seen.map((k) => k.getBoundingClientRect().right))
        return { id: s.getAttribute('aria-labelledby') || s.id || s.className.slice(0, 40), span: right - left }
      }),
    )
    expect(widths.length, 'main > section').toBeGreaterThan(2)
    for (const w of widths) {
      expect(w.span, `seksjon ${w.id} bruker for lite bredde`).toBeGreaterThanOrEqual(MIN)
    }

    // 3. Hero: H1, the orgnr field and the product picture above the fold
    for (const sel of ['h1', '[data-testid=orgnr-input]', '[data-testid=hero-image]']) {
      const box = await page.locator(sel).first().boundingBox({ timeout: 5000 })
      expect(box, `${sel} mangler`).not.toBeNull()
      expect(box!.y + box!.height, `${sel} under folden`).toBeLessThanOrEqual(900)
    }

    // 4. The hero picture is at least 40 % of the width
    const img = await page.locator('[data-testid=hero-image]').first().boundingBox()
    expect(img!.width).toBeGreaterThanOrEqual(1440 * 0.4)
  })

  test(`layout ${path} @375`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(path)

    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'horisontal scroll').toBe(false)

    // 4.3: on a phone, the H1 and the button within the first 600 px
    for (const sel of ['h1', '[data-testid=orgnr-input]', 'main form button[type=submit]']) {
      const box = await page.locator(sel).first().boundingBox({ timeout: 5000 })
      expect(box, `${sel} mangler`).not.toBeNull()
      expect(box!.y + box!.height, `${sel} under 600 px`).toBeLessThanOrEqual(600)
    }

    // 3: touch targets of at least 44 x 44 px, text links inside a sentence excepted
    const small = await page.$$eval('a, button, input, select', (els) =>
      els
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (!r.width || getComputedStyle(el).display === 'inline') return false
          return r.height < 44 || r.width < 44
        })
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`),
    )
    expect(small, 'trykkflater under 44 px').toEqual([])
  })
}
