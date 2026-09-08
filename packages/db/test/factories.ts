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

/** Create an ACTIVE vendor (with IBAN + commission rate) — no products. */
export async function makeVendorOnly(commissionRate = "0.15") {
  const userId = uid("vusr");
  await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, role: "VENDOR" } });
  const vendor = await prisma.vendor.create({
    data: {
      userId,
      storeName: "Balance Store",
      storeSlug: uid("store"),
      status: "ACTIVE",
      commissionRate,
      ibanNumber: "AE070331234567890123456",
    },
  });
  return { vendorId: vendor.id, userId };
}

/** Create a customer + address + product + variant + order with one line item for `vendorId`. */
export async function makeSale(
  vendorId: string,
  unitPrice: string,
  quantity: number,
  fulfillmentStatus: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "RETURNED" = "DELIVERED",
) {
  const { userId, profileId } = await makeCustomer();
  const address = await prisma.address.create({
    data: { userId, fullName: "Test", phone: "0500000000", addressLine1: "1 St", city: "Dubai" },
  });
  const product = await prisma.product.create({
    data: { vendorId, title: "P", slug: uid("prod"), price: unitPrice, category: "everyday", status: "ACTIVE" },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, size: "M", color: "Black", sku: uid("sku"), stock: 100, price: unitPrice },
  });
  const total = (Number(unitPrice) * quantity).toFixed(2);
  const order = await prisma.order.create({
    data: {
      customerId: profileId,
      addressId: address.id,
      status: "DELIVERED",
      subtotal: total,
      total,
      paymentMethod: "CARD",
      items: { create: { variantId: variant.id, vendorId, quantity, unitPrice, fulfillmentStatus } },
    },
  });
  return { orderId: order.id, variantId: variant.id };
}

export async function stockOf(variantId: string): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true } });
  return v.stock;
}

export async function balanceOf(profileId: string): Promise<string> {
  const p = await prisma.customerProfile.findUniqueOrThrow({ where: { id: profileId }, select: { walletBalance: true } });
  return p.walletBalance.toString();
}

/** Create an ACTIVE supplier (with IBAN) — no materials. */
export async function makeSupplierOnly(iban = "AE070331234567890999") {
  const userId = uid("susr");
  await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, role: "SUPPLIER" } });
  const supplier = await prisma.supplier.create({
    data: {
      userId,
      companyName: "Test Supplier",
      companySlug: uid("supp"),
      status: "ACTIVE",
      materialTypes: ["Fabric"],
      ibanNumber: iban,
    },
  });
  return { supplierId: supplier.id, userId };
}

type MaterialOrderStatus = "PENDING" | "ACCEPTED" | "SHIPPED" | "COMPLETED" | "CANCELLED" | "REJECTED";

/** Create a MaterialOrder from a fresh vendor buyer to `supplierId`. */
export async function makeMaterialOrder(
  supplierId: string,
  total: string,
  status: MaterialOrderStatus = "COMPLETED",
) {
  const { vendorId } = await makeVendorOnly();
  const order = await prisma.materialOrder.create({
    data: { vendorId, supplierId, total, status },
  });
  return { orderId: order.id, vendorId };
}
