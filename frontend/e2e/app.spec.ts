import { expect, type Page, type Route, test } from '@playwright/test'

type Override = (route: Route) => Promise<void>

/** Answer every /api call from the fixtures; individual tests can override endpoints. */
async function mockApi(page: Page, overrides: Record<string, Override> = {}) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const name = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
    const override = overrides[name]
    if (override) return override(route)
    if (name === 'health') return route.fulfill({ json: { status: 'ok' } })
    return route.fulfill({ path: `e2e/fixtures/${name}.json`, contentType: 'application/json' })
  })
  return errors
}

async function planExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Denver → Chicago' }).click()
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible()
}

test('recommends the route that avoids severe weather and explains why', async ({ page }) => {
  const errors = await mockApi(page)
  await planExample(page)

  const card = page.getByRole('region', { name: 'Recommendation' })
  await expect(page.getByRole('heading', { level: 2 })).toContainText('C')
  await expect(page.getByText(/Fewest Severe miles: 25 mi, against 225 mi/)).toBeVisible()
  await expect(page.getByText(/avoids 225 mi of Severe conditions on the fastest route/)).toBeVisible()
  await expect(card).toBeVisible()

  // Route cards are ordered by the ranking: C first.
  const options = page.getByRole('list', { name: 'Route options' }).getByRole('listitem')
  await expect(options).toHaveCount(3)
  await expect(options.first()).toContainText('via Synthetic')
  await expect(options.first().getByText('C', { exact: true })).toBeVisible()

  // Every route is labelled on the map too.
  for (const id of ['A', 'B', 'C']) {
    await expect(page.getByRole('button', { name: new RegExp(`^Route ${id}, `) })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('shows checkpoint details for a selected route', async ({ page }) => {
  await mockApi(page)
  await planExample(page)

  await page.getByRole('list', { name: 'Route options' }).getByRole('button', { name: /Synthetic I-1/ }).click()
  const list = page.getByRole('region', { name: 'Route A checkpoints' })
  await expect(list).toBeVisible()

  const severeRow = list.getByRole('button').filter({ hasText: 'Severe' }).first()
  await severeRow.click()
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toContainText('Route A')
  await expect(popup).toContainText('Severe')
  await expect(popup).toContainText(/Snow 2\.\d+ in\/hr is Severe/)
})

test('scrubs the 48-hour forecast and switches weather layers', async ({ page }) => {
  await mockApi(page)
  await planExample(page)

  const slider = page.getByRole('slider', { name: 'Forecast hour' })
  await expect(slider).toBeEnabled()
  await slider.focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/\+2h00/)).toBeVisible()

  await page.getByRole('radio', { name: 'Snow' }).click()
  await expect(page.getByText('ticks = risk thresholds')).toBeVisible()
  await page.getByRole('button', { name: 'Play forecast' }).click()
  await expect(page.getByRole('button', { name: 'Pause forecast' })).toBeVisible()
})

test('autocompletes places', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  const origin = page.getByRole('combobox').first()
  await origin.fill('den')
  await page.getByRole('option', { name: /Denver, CO/ }).click()
  await expect(origin).toHaveValue('Denver, CO')
})

test('explains provider errors', async ({ page }) => {
  await mockApi(page, {
    routes: (route) =>
      route.fulfill({
        status: 503,
        json: { error: { code: 'not_configured', message: "Routing isn't configured on this server yet.", details: null } },
      }),
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Denver → Chicago' }).click()
  await expect(page.getByRole('alert')).toContainText("Routing isn't configured")
})
