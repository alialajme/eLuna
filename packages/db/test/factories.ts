import { prisma } from "../src/client";

let n = 0;
const uid = (p: string) => `${p}_test_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 8)}`;

/** Create a customer (User + CustomerProfile) with an optional starting wallet balance. */
export async function makeCustomer(walletBalance = 0) {
  const userId = uid("usr");
  await prisma.user.create({
    data: { id: userId, email: `${userId}@test.local`, role: "CUSTOMER" },
  });
  const profile = await prisma.customerProfile.create({
    data: { userId, walletBalance },
  });
  return { userId, profileId: profile.id };
}

/** Create a vendor + product + a single variant with the given stock. Returns the variantId. */
export async function makeVariant(stock: number, unitPrice = "100.00") {
  const userId = uid("vusr");
  await prisma.user.create({
    data: { id: userId, email: `${userId}@test.local`, role: "VENDOR" },
  });
  const vendor = await prisma.vendor.create({
    data: { userId, storeName: "Test Store", storeSlug: uid("store"), status: "ACTIVE" },
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      title: "Test Abaya",
      slug: uid("prod"),
      price: unitPrice,
      category: "everyday",
      status: "ACTIVE",
    },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, size: "M", color: "Black", sku: uid("sku"), stock, price: unitPrice },
  });
  return { variantId: variant.id, vendorId: vendor.id, productId: product.id };
}

export async function stockOf(variantId: string): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true } });
  return v.stock;
}

export async function balanceOf(profileId: string): Promise<string> {
  const p = await prisma.customerProfile.findUniqueOrThrow({ where: { id: profileId }, select: { walletBalance: true } });
  return p.walletBalance.toString();
}
