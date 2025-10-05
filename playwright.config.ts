// / <reference types="@playwright/test" />
import process from 'node:process'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import type { TestOptions } from './tests/e2e/fixtures.js'

const _dirname = import.meta.dirname

dotenv.config({ path: path.resolve(_dirname, '.env.development') })
dotenv.config({ path: path.resolve(_dirname, '.env.test.local') })

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
    baseURL: 'http://localhost:5173',

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

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    {
      name: 'e2e-raw',
      use: {
        variant: 'raw',
      },
    },

    {
      name: 'e2e-sdk',
      use: {
        variant: 'sdk',
      },
    },

    /* Test against mobile viewports. */
    // {
    //   Name: 'Mobile Chrome',
    //   Use: { ...devices['Pixel 5'] },
    // },
    // {
    //   Name: 'Mobile Safari',
    //   Use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   Name: 'Microsoft Edge',
    //   Use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   Name: 'Google Chrome',
    //   Use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !import.meta.dirname,
  },
})
