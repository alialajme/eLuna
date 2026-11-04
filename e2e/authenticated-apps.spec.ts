import { test, expect } from "@playwright/test";

/**
 * Vendor / Admin / Supplier are Clerk-authenticated. These specs encode the
 * critical per-app path but REQUIRE a dedicated TEST Clerk instance + a seeded
 * test user per role, provided via env:
 *   AYVANA_E2E_CLERK_SECRET_KEY, AYVANA_E2E_CLERK_PUBLISHABLE_KEY
 *   E2E_VENDOR_BASE_URL / E2E_ADMIN_BASE_URL / E2E_SUPPLIER_BASE_URL
 * They SKIP without it — we never ship the dev auth-bypass shim into tests. See
 * e2e/README.md for the sign-in helper CI must provide.
 */
const hasTestAuth = !!process.env.AYVANA_E2E_CLERK_SECRET_KEY;
const base = {
  vendor: process.env.E2E_VENDOR_BASE_URL ?? "http://localhost:3001",
  admin: process.env.E2E_ADMIN_BASE_URL ?? "http://localhost:3002",
  supplier: process.env.E2E_SUPPLIER_BASE_URL ?? "http://localhost:3003",
};

test.describe("vendor OS critical path", () => {
  test.skip(!hasTestAuth, "requires a test Clerk instance (AYVANA_E2E_CLERK_*)");
  test("vendor reaches products and the new-product form", async ({ page }) => {
    // signInAs(page, "VENDOR") — see e2e/README.md
    await page.goto(`${base.vendor}/products`);
    await expect(page.getByRole("link", { name: /new product|add product/i })).toBeVisible();
  });
});

test.describe("admin console critical path", () => {
  test.skip(!hasTestAuth, "requires a test Clerk instance (AYVANA_E2E_CLERK_*)");
  test("admin reaches the seller-approvals queue", async ({ page }) => {
    await page.goto(`${base.admin}/sellers/approvals`);
    await expect(page.getByRole("heading", { name: /approval|sellers/i }).first()).toBeVisible();
  });
});

test.describe("supplier OS critical path", () => {
  test.skip(!hasTestAuth, "requires a test Clerk instance (AYVANA_E2E_CLERK_*)");
  test("supplier reaches incoming material orders", async ({ page }) => {
    await page.goto(`${base.supplier}/orders`);
    await expect(page.getByText(/incoming|orders/i).first()).toBeVisible();
  });
});
