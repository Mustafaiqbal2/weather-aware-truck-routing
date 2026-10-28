import { expect, test } from '@playwright/test'

test('plans trips even when the basemap service is unreachable', async ({ page }) => {
  await page.route(/basemaps\.cartocdn\.com/, (route) => route.abort('namenotresolved'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const name = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
      if (name === 'health') return route.fulfill({ json: { status: 'ok' } })
      return route.fulfill({ path: `e2e/fixtures/${name}.json`, contentType: 'application/json' })
    },
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Denver → Chicago' }).click()
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: /map/i })).toBeVisible()
})
