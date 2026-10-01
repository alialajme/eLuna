import { describe, it, expect } from "vitest";
import { prisma } from "@ayvana/db";
import { startGeneration, linkSessionToProduct, approveSession } from "../src";
import { makeVendor, makeGarment, makeProduct } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const idem = () => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// A shoot launched from the product flow is scoped to a product, and a vendor can
// only scope / attach to THEIR OWN product. These guard the per-product link that
// the Add/Edit Product flow relies on.
describe("per-product shoot link + ownership (integration)", () => {
  it("scopes a shoot to the vendor's own product (existing-product path)", async () => {
    const v = await makeVendor();
    const { garmentId } = await makeGarment(v.vendorId);
    const { productId } = await makeProduct(v.vendorId);

    const res = await startGeneration({
      vendorId: v.vendorId,
      garmentId,
      productId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const session = await prisma.generationSession.findUnique({
      where: { id: res.sessionId },
      select: { productId: true },
    });
    expect(session?.productId).toBe(productId);
  });

  it("links a session + its garment to a product after save (new-product path)", async () => {
    const v = await makeVendor();
    const { garmentId } = await makeGarment(v.vendorId);
    // New product: the shoot runs with no productId...
    const started = await startGeneration({
      vendorId: v.vendorId,
      garmentId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    if (!started.ok) throw new Error("setup failed");

    // ...then the product is created and the shoot is linked.
    const { productId } = await makeProduct(v.vendorId);
    const linked = await linkSessionToProduct(started.sessionId, productId, v.vendorId);
    expect(linked.ok).toBe(true);

    const session = await prisma.generationSession.findUnique({
      where: { id: started.sessionId },
      select: { productId: true, garment: { select: { productId: true } } },
    });
    expect(session?.productId).toBe(productId);
    expect(session?.garment.productId).toBe(productId);
  });

  it("refuses to attach a shoot to ANOTHER seller's product", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(a.vendorId);
    const started = await startGeneration({
      vendorId: a.vendorId,
      garmentId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    if (!started.ok) throw new Error("setup failed");

    // Seller B owns this product; Seller A must not be able to link their shoot to it.
    const { productId: bProduct } = await makeProduct(b.vendorId);
    const linked = await linkSessionToProduct(started.sessionId, bProduct, a.vendorId);
    expect(linked.ok).toBe(false);

    const session = await prisma.generationSession.findUnique({
      where: { id: started.sessionId },
      select: { productId: true },
    });
    expect(session?.productId).toBeNull();
  });

  it("refuses to link ANOTHER seller's shoot to your product", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(b.vendorId);
    const bShoot = await startGeneration({
      vendorId: b.vendorId,
      garmentId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    if (!bShoot.ok) throw new Error("setup failed");

    // Seller A tries to pull Seller B's shoot onto A's own product.
    const { productId: aProduct } = await makeProduct(a.vendorId);
    const linked = await linkSessionToProduct(bShoot.sessionId, aProduct, a.vendorId);
    expect(linked.ok).toBe(false);
  });

  it("refuses to approve ANOTHER seller's shoot (undisclosed existence)", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(b.vendorId);
    const bShoot = await startGeneration({
      vendorId: b.vendorId,
      garmentId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    if (!bShoot.ok) throw new Error("setup failed");

    const res = await approveSession(bShoot.sessionId, a.vendorId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOT_OWNED");
  });
});
