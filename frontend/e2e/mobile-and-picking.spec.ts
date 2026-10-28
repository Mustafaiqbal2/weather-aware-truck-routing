import { expect, type Page, test } from '@playwright/test'

/** Fixtures for the trip endpoints, plus a canned name for any point picked on the map. */
async function mockApi(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.replace(/^\/api\//, '')
      if (name === 'health') return route.fulfill({ json: { status: 'ok' } })
      if (name === 'reverse') {
        return route.fulfill({
          json: {
            id: 'r1',
            label: 'Bushnell, NE',
            detail: 'Bushnell, NE 69128',
            lat: Number(url.searchParams.get('lat')),
            lon: Number(url.searchParams.get('lon')),
            kind: 'Point',
          },
        })
      }
      return route.fulfill({ path: `e2e/fixtures/${name}.json`, contentType: 'application/json' })
    },
  )
  return errors
}

test('drops a pin on the map and uses it as the start of the trip', async ({ page }) => {
  const errors = await mockApi(page)
  await page.goto('/')

  // Clicks only become pins once the basemap has loaded, so retry until it has.
  const pin = page.getByRole('dialog', { name: 'Dropped pin' })
  await expect(async () => {
    await page.locator('main').click({ position: { x: 360, y: 320 } })
    await expect(pin).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 30_000 })

  await expect(pin).toContainText('Bushnell, NE')
  await pin.getByRole('button', { name: 'Start here' }).click()
  await expect(pin).toBeHidden()
  await expect(page.getByPlaceholder('Origin')).toHaveValue('Bushnell, NE')
  await expect(page.getByRole('img', { name: 'Start: Bushnell, NE' })).toBeVisible()
  expect(errors).toEqual([])
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

  test('plans in a bottom sheet over a full-screen map', async ({ page }) => {
    const errors = await mockApi(page)
    await page.goto('/')
    const sheet = page.getByRole('region', { name: 'Trip panel' })
    await expect(sheet).toBeVisible()

    await page.getByRole('button', { name: 'Denver → Chicago' }).click()

    // The sheet settles halfway on the results, with the pick in its header and the
    // forecast dock riding on top.
    await expect(page.getByRole('region', { name: 'Recommendation' })).toBeInViewport()
    await expect(sheet.getByText('Pick', { exact: true })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Forecast hour' })).toBeInViewport()
    for (const id of ['A', 'B', 'C']) {
      await expect(page.getByRole('button', { name: new RegExp(`^Route ${id}, `) })).toBeVisible()
    }

    // The handle opens the sheet fully and back.
    await page.getByRole('button', { name: 'Expand trip panel' }).click()
    await expect(page.getByRole('button', { name: 'Collapse trip panel' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await page.getByRole('button', { name: 'Collapse trip panel' }).click()
    await expect(page.getByRole('button', { name: 'Expand trip panel' })).toBeVisible()
    expect(errors).toEqual([])
  })
})
