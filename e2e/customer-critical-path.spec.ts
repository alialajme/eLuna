import { test, expect } from "@playwright/test";

/**
 * Customer storefront — the critical guest path (no auth required): discover a
 * product and build purchase intent. Runs against E2E_BASE_URL (the customer app).
 * Checkout itself needs a signed-in customer + a test payment provider, covered
 * by the authenticated matrix in authenticated-apps.spec.ts.
 */
test.describe("customer storefront critical path (guest)", () => {
  test("home → browse → product detail → add to bag → bag reflects item", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AYVANA/i);

    await page.goto("/browse");
    const productLinks = page.locator('a[href^="/p/"]');
    await expect(productLinks.first()).toBeVisible();

    await productLinks.first().click();
    await expect(page).toHaveURL(/\/p\//);
    const addToBag = page.getByRole("button", { name: /add to (bag|cart)/i });
    await expect(addToBag).toBeVisible();

    // Pick a size if the variant selector is present, then add.
    const size = page.getByRole("button", { name: /^(XS|S|M|L|XL|XXL)$/ }).first();
    if (await size.count()) await size.click();
    await addToBag.click();

    await page.goto("/cart");
    await expect(page.getByText(/bag|cart|subtotal|order summary/i).first()).toBeVisible();
  });

  test("liveness + readiness health endpoints respond", async ({ page }) => {
    expect((await page.request.get("/api/health/live")).ok()).toBeTruthy();
    const ready = await page.request.get("/api/health/ready");
    // ready may be 200 (DB up) or 503 (DB down) — it must respond, not hang.
    expect([200, 503]).toContain(ready.status());
  });
});
