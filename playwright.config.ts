import { defineConfig, devices } from "@playwright/test";

/**
 * AYVANA end-to-end tests. Specs live in `e2e/`.
 *
 * The customer storefront is guest-browsable, so its critical path runs with no
 * auth. The vendor/admin/supplier apps are Clerk-authenticated: their specs
 * `test.skip` unless a TEST Clerk instance is wired via AYVANA_E2E_* env (see
 * e2e/README.md) — we never ship the dev auth-bypass shim.
 *
 * Run against an already-running server:
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
