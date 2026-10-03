import { describe, it, expect } from "vitest";
import { startGeneration, getSessionForVendor, listSessionsForVendor } from "../src";
import { makeVendor, makeGarment } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const idem = () => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// Seller A can NEVER read or act on Seller B's garments / sessions / assets.
describe("seller/org isolation (integration)", () => {
  it("rejects starting a generation on another seller's garment", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId: bGarment } = await makeGarment(b.vendorId);

    // Seller A tries to start a shoot on Seller B's garment.
    const res = await startGeneration({
      vendorId: a.vendorId,
      garmentId: bGarment,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOT_OWNED");
  });

  it("returns null when reading another seller's session (undisclosed existence)", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(b.vendorId);
    const started = await startGeneration({
      vendorId: b.vendorId,
      garmentId,
      idempotencyKey: idem(),
      correlationId: cid(),
    });
    if (!started.ok) throw new Error("setup failed");

    // B can read it.
    const asOwner = await getSessionForVendor(started.sessionId, b.vendorId);
    expect(asOwner).not.toBeNull();

    // A cannot — same result as a missing session.
    const asOther = await getSessionForVendor(started.sessionId, a.vendorId);
    expect(asOther).toBeNull();
  });

  it("scopes session lists to the owning vendor", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(b.vendorId);
    await startGeneration({ vendorId: b.vendorId, garmentId, idempotencyKey: idem(), correlationId: cid() });

    const aList = await listSessionsForVendor(a.vendorId);
    const bList = await listSessionsForVendor(b.vendorId);
    expect(aList.length).toBe(0);
    expect(bList.length).toBe(1);
  });

  it("dedup ownership check: A's duplicate key cannot resolve to B's job", async () => {
    const a = await makeVendor();
    const b = await makeVendor();
    const { garmentId } = await makeGarment(b.vendorId);
    const key = idem();
    const bStart = await startGeneration({ vendorId: b.vendorId, garmentId, idempotencyKey: key, correlationId: cid() });
    expect(bStart.ok).toBe(true);

    // A replays B's idempotency key — must be refused, not handed B's job.
    const aStart = await startGeneration({
      vendorId: a.vendorId,
      garmentId,
      idempotencyKey: key,
      correlationId: cid(),
    });
    expect(aStart.ok).toBe(false);
    if (!aStart.ok) expect(aStart.reason).toBe("NOT_OWNED");
  });
});
