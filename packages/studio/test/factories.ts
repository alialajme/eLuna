import { prisma, grantCredit } from "@ayvana/db";

let n = 0;
const uid = (p: string) => `${p}_studio_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create an ACTIVE (default) vendor with a User. ACTIVE vendors are granted a
 * generous shoot balance by default so existing pipeline/isolation tests (which
 * assume a shoot can start) keep passing. Pass `shoots: 0` to test the empty-
 * wallet / INSUFFICIENT_CREDITS path.
 */
export async function makeVendor(
  status: "ACTIVE" | "PENDING" | "SUSPENDED" = "ACTIVE",
  opts: { shoots?: number } = {},
) {
  const userId = uid("vusr");
  await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, role: "VENDOR" } });
  const vendor = await prisma.vendor.create({
    data: { userId, storeName: "Studio Store", storeSlug: uid("store"), status },
  });
  const shoots = opts.shoots ?? 100;
  if (shoots > 0) await grantShoots(vendor.id, shoots);
  return { vendorId: vendor.id, userId };
}

/** Grant N AI Shoots to a vendor's wallet (test helper). */
export async function grantShoots(vendorId: string, shoots: number) {
  await grantCredit({
    vendorId,
    shoots,
    type: "GRANT",
    idempotencyKey: uid("grant"),
    reason: "test grant",
  });
}

/** Read a vendor's wallet balances as numbers (test helper). */
export async function walletOf(vendorId: string) {
  const w = await prisma.creditWallet.findUnique({
    where: { vendorId },
    select: { available: true, reserved: true, lifetimeConsumed: true },
  });
  return {
    available: Number(w?.available ?? 0),
    reserved: Number(w?.reserved ?? 0),
    lifetimeConsumed: Number(w?.lifetimeConsumed ?? 0),
  };
}

/** Create a product for a vendor (used to test per-product shoot linking). */
export async function makeProduct(vendorId: string) {
  const product = await prisma.product.create({
    data: {
      vendorId,
      title: "Test Abaya",
      slug: uid("prod"),
      price: 499,
      category: "occasion",
    },
    select: { id: true },
  });
  return { productId: product.id };
}

/** Create a QC_PASSED garment with front + back images for a vendor. */
export async function makeGarment(vendorId: string) {
  const garment = await prisma.garmentAsset.create({
    data: {
      vendorId,
      status: "QC_PASSED",
      images: {
        create: [
          { role: "FRONT", storageKey: `original/${uid("img")}-front.jpg`, qcPassed: true },
          { role: "BACK", storageKey: `original/${uid("img")}-back.jpg`, qcPassed: true },
        ],
      },
    },
    select: { id: true },
  });
  return { garmentId: garment.id };
}
