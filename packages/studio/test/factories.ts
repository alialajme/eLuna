import { prisma } from "@ayvana/db";

let n = 0;
const uid = (p: string) => `${p}_studio_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 8)}`;

/** Create an ACTIVE (default) vendor with a User. */
export async function makeVendor(status: "ACTIVE" | "PENDING" | "SUSPENDED" = "ACTIVE") {
  const userId = uid("vusr");
  await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, role: "VENDOR" } });
  const vendor = await prisma.vendor.create({
    data: { userId, storeName: "Studio Store", storeSlug: uid("store"), status },
  });
  return { vendorId: vendor.id, userId };
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
