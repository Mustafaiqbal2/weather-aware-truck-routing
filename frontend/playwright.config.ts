import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the production build, with the API answered from
 * deterministic fixtures (see e2e/fixtures and backend/scripts/make_e2e_fixtures.py).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 25_000 },
  fullyParallel: true,
  // Each browser renders WebGL in software (no GPU), which is CPU-heavy: keep parallelism modest.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Software WebGL so the map and heatmap render on CI machines without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
