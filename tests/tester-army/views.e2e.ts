import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
const options = { platforms: ['web'] }
test('report renders generated data and navigates to its coverage and work sections', options, async ({ app, browser, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('heading', 'Trust & Coverage')).toBeVisible()
  await expect(browser.locator('body')).toContainText('/synthetic/project')
  await browser.locator('a[href="#section-work"]').tap()
  await expect(browser).toHaveURL(/#section-work$/)
  await expect(browser.locator('#section-work')).toBeVisible()
})
test('profile tabs switch real rendered panels and Copy link reports its outcome', options, async ({ app, browser, screen }) => {
  await app.open('/profile/')
  await expect(screen.getByRole('heading', 'Synthetic Reader')).toBeVisible()
  for (const [label, view] of [['Weekly', 'weekly'], ['Cumulative', 'cumulative'], ['Daily', 'daily']]) {
    await screen.getByRole('tab', label).tap()
    expect(await browser.evaluate(view => document.querySelector(`[data-view="${view}"]`).getAttribute('aria-selected'), view)).toBe('true')
    await expect(browser.locator(`[data-panel="${view}"]`)).toBeVisible()
    expect(await browser.evaluate(() => Array.from(document.querySelectorAll('[data-panel]')).filter(p => !p.hidden).length)).toBe(1)
  }
  await screen.getByRole('button', 'Copy link').tap()
  await expect(browser.locator('#share-link')).toHaveText(/Copied|Copy URL from address bar/)
})
for (const width of [375, 1440]) for (const route of ['/', '/profile/']) test(`${route} fits ${width}px without horizontal overflow`, options, async ({ app, browser }) => {
  await browser.setViewport({ width, height: 900 })
  await app.open(route)
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await browser.evaluate(() => document.body.innerText.length > 100)).toBe(true)
})
test('sample report recommendation checkboxes and individual/bulk copying work', options, async ({ app, browser, screen }) => {
  await app.open('/sample/')
  await expect(browser.locator('.agents-checkbox')).toHaveCount(2)
  await browser.locator('#agents-item-0').uncheck()
  await expect(browser.locator('#agents-item-0')).not.toBeChecked()
  await expect(browser.locator('#agents-item-1')).toBeChecked()
  await screen.getByRole('button', 'Copy All Checked').tap()
  await expect(browser.locator('.copy-all-btn')).toHaveText(/Copied|Copy failed/)
  await browser.locator('#agents-item-0').check()
  await expect(browser.locator('#agents-item-0')).toBeChecked()
  await browser.locator('.agents-item .copy-btn').first().tap()
  await expect(browser.locator('.agents-item .copy-btn').first()).toHaveText(/Copied|Copy failed/)
})
