// / <reference types="@playwright/test" />
import process from 'node:process'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import type { TestOptions } from './tests/e2e/helpers/fixtures'

const _dirname = import.meta.dirname

dotenv.config({ path: path.resolve(_dirname, '.env') })
dotenv.config({ path: path.resolve(_dirname, '.env.local') })

export default defineConfig<TestOptions>({
  testDir: './tests',
  testMatch: '**/tests/e2e/*.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: Boolean(process.env.CI),
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://127.0.0.1:5100',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Regular e2e tests (no variant)
    {
      name: 'e2e',
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /.*auth\.spec\.ts$/, // Exclude auth tests
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Auth tests with raw variant
    {
      name: 'e2e-auth-raw',
      testMatch: /.*auth\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        variant: 'raw',
      },
    },

    // Auth tests with sdk variant
    {
      name: 'e2e-auth-sdk',
      testMatch: /.*auth\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        variant: 'sdk',
      },
    },

    // /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    // /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /**
   * Global setup to ensure dev server stability across parallel test workers.
   *
   * Problem: Playwright's webServer config polls for HTTP 200, but doesn't guarantee
   * the app is fully compiled/hydrated when workers spawn. With fullyParallel: true
   * and multiple browser projects, Firefox workers occasionally won race conditions
   * and attempted navigation before Vite finished initial HMR compilation, causing
   * NS_ERROR_CONNECTION_REFUSED.
   *
   * Solution: This setup runs once before all workers start, performing a full
   * navigation + DOM validation to confirm Vue's mount point exists. Only after
   * this succeeds do test workers begin execution, eliminating the race.
   *
   * @see https://playwright.dev/docs/test-global-setup-teardown
   */
  globalSetup: './tests/e2e/setup.ts',

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5100',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
