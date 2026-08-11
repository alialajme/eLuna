// Additive, idempotent demo seed — layers admin + suppliers + materials +
// material orders + a couple customer orders on top of the base seed.ts data
// (vendors/products/customers). Safe to re-run. Run AFTER seed.ts.
import {
  PrismaClient,
  UserRole,
  SupplierStatus,
  MaterialStatus,
  MaterialUnit,
  MaterialOrderStatus,
  OrderStatus,
  FulfillmentStatus,
  PaymentMethod,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🌙 Seeding demo data (admin + suppliers + materials + orders)…");

  // ── Admin ────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: "admin@seed.luna.ae" },
    update: { role: UserRole.ADMIN },
    create: { id: "user_seed_admin", email: "admin@seed.luna.ae", role: UserRole.ADMIN, mfaEnabled: true },
  });
  console.log("✅ Admin user");

  // ── Suppliers ──────────────────────────────────────────────────────────────
  async function upsertSupplier(opts: {
    id: string;
    email: string;
    companyName: string;
    companySlug: string;
    status: SupplierStatus;
    materialTypes: string[];
  }) {
    const user = await prisma.user.upsert({
      where: { email: opts.email },
      update: { role: UserRole.SUPPLIER },
      create: { id: opts.id, email: opts.email, role: UserRole.SUPPLIER, mfaEnabled: true },
    });
    return prisma.supplier.upsert({
      where: { companySlug: opts.companySlug },
      update: { status: opts.status },
      create: {
        userId: user.id,
        companyName: opts.companyName,
        companySlug: opts.companySlug,
        description: `${opts.companyName} — wholesale materials for Luna vendors.`,
        status: opts.status,
        materialTypes: opts.materialTypes,
      },
    });
  }

  const gulf = await upsertSupplier({
    id: "user_seed_supplier_gulf",
    email: "gulf@seed.luna.ae",
    companyName: "Gulf Textiles Trading",
    companySlug: "gulf-textiles",
    status: SupplierStatus.ACTIVE,
    materialTypes: ["fabric", "lining", "trim"],
  });
  const emirates = await upsertSupplier({
    id: "user_seed_supplier_emirates",
    email: "emirates@seed.luna.ae",
    companyName: "Emirates Fabrics",
    companySlug: "emirates-fabrics",
    status: SupplierStatus.ACTIVE,
    materialTypes: ["fabric", "thread"],
  });
  // A PENDING supplier so the admin approvals queue has something to show.
  await upsertSupplier({
    id: "user_seed_supplier_nova",
    email: "nova@seed.luna.ae",
    companyName: "Nova Trims & Notions",
    companySlug: "nova-trims",
    status: SupplierStatus.PENDING,
    materialTypes: ["trim", "hardware"],
  });
  console.log("✅ Suppliers (2 active, 1 pending)");

  // ── Materials ──────────────────────────────────────────────────────────────
  type MatSpec = {
    slug: string;
    name: string;
    materialType: string;
    color: string | null;
    composition: string | null;
    unit: MaterialUnit;
    wholesalePrice: string;
    moq: number;
    stock: number;
    status?: MaterialStatus;
  };

  async function upsertMaterials(supplierId: string, specs: MatSpec[]) {
    const out: Record<string, string> = {};
    for (const s of specs) {
      const m = await prisma.material.upsert({
        where: { slug: s.slug },
        update: { stock: s.stock, wholesalePrice: new Decimal(s.wholesalePrice), status: s.status ?? MaterialStatus.ACTIVE },
        create: {
          supplierId,
          slug: s.slug,
          name: s.name,
          materialType: s.materialType,
          color: s.color,
          composition: s.composition,
          unit: s.unit,
          wholesalePrice: new Decimal(s.wholesalePrice),
          moq: s.moq,
          stock: s.stock,
          status: s.status ?? MaterialStatus.ACTIVE,
        },
      });
      out[s.slug] = m.id;
    }
    return out;
  }

  const gulfMats = await upsertMaterials(gulf.id, [
    // Two deliberately LOW stock (< 5) so flag_low_material_stock has hits.
    { slug: "gulf-black-nida-crepe", name: "Black Nida Crepe", materialType: "fabric", color: "Jet Black", composition: "100% polyester", unit: MaterialUnit.METER, wholesalePrice: "45.00", moq: 10, stock: 3 },
    { slug: "gulf-gold-zip-trim", name: "Gold Metal Zip Trim", materialType: "trim", color: "Gold", composition: null, unit: MaterialUnit.PIECE, wholesalePrice: "5.50", moq: 50, stock: 2 },
    { slug: "gulf-navy-nida-crepe", name: "Navy Nida Crepe", materialType: "fabric", color: "Navy", composition: "100% polyester", unit: MaterialUnit.METER, wholesalePrice: "48.00", moq: 10, stock: 120 },
    { slug: "gulf-ivory-silk-lining", name: "Ivory Silk Lining", materialType: "lining", color: "Ivory", composition: "100% silk", unit: MaterialUnit.METER, wholesalePrice: "30.00", moq: 20, stock: 40 },
    { slug: "gulf-premium-wool-blend", name: "Premium Wool Blend (draft)", materialType: "fabric", color: "Charcoal", composition: "70% wool 30% poly", unit: MaterialUnit.METER, wholesalePrice: "90.00", moq: 5, stock: 15, status: MaterialStatus.DRAFT },
  ]);

  await upsertMaterials(emirates.id, [
    { slug: "emirates-cotton-poplin", name: "Standard Cotton Poplin", materialType: "fabric", color: "White", composition: "100% cotton", unit: MaterialUnit.METER, wholesalePrice: "22.00", moq: 25, stock: 300 },
    { slug: "emirates-heavy-crepe", name: "Heavy Crepe", materialType: "fabric", color: "Black", composition: "100% polyester", unit: MaterialUnit.METER, wholesalePrice: "52.00", moq: 10, stock: 80 },
    { slug: "emirates-poly-thread", name: "Polyester Thread Cone", materialType: "thread", color: "Black", composition: "100% polyester", unit: MaterialUnit.SPOOL, wholesalePrice: "8.00", moq: 100, stock: 200 },
  ]);
  console.log("✅ Materials created");

  // ── Material orders (vendors → Gulf Textiles) ──────────────────────────────
  const vendors = await prisma.vendor.findMany({
    where: { storeSlug: { in: ["nidaa-studio", "lomar", "bashaer"] } },
    select: { id: true, storeSlug: true },
  });
  const vId = (slug: string) => vendors.find((v) => v.storeSlug === slug)?.id;

  async function upsertMaterialOrder(opts: {
    id: string;
    vendorSlug: string;
    materialSlug: string;
    materialName: string;
    unit: MaterialUnit;
    unitPrice: string;
    quantity: number;
    status: MaterialOrderStatus;
    note?: string;
    trackingNote?: string;
  }) {
    const vendorId = vId(opts.vendorSlug);
    if (!vendorId) return;
    const total = new Decimal(opts.unitPrice).mul(opts.quantity);
    await prisma.materialOrder.upsert({
      where: { id: opts.id },
      update: { status: opts.status },
      create: {
        id: opts.id,
        vendorId,
        supplierId: gulf.id,
        status: opts.status,
        total,
        note: opts.note ?? null,
        trackingNote: opts.trackingNote ?? null,
        items: {
          create: [
            {
              materialId: gulfMats[opts.materialSlug] ?? null,
              materialName: opts.materialName,
              unit: opts.unit,
              unitPrice: new Decimal(opts.unitPrice),
              quantity: opts.quantity,
            },
          ],
        },
      },
    });
  }

  await upsertMaterialOrder({ id: "matorder_seed_1", vendorSlug: "lomar", materialSlug: "gulf-black-nida-crepe", materialName: "Black Nida Crepe", unit: MaterialUnit.METER, unitPrice: "45.00", quantity: 20, status: MaterialOrderStatus.PENDING, note: "Need this for the spring everyday line — flexible on timing." });
  await upsertMaterialOrder({ id: "matorder_seed_2", vendorSlug: "bashaer", materialSlug: "gulf-navy-nida-crepe", materialName: "Navy Nida Crepe", unit: MaterialUnit.METER, unitPrice: "48.00", quantity: 15, status: MaterialOrderStatus.PENDING });
  await upsertMaterialOrder({ id: "matorder_seed_3", vendorSlug: "nidaa-studio", materialSlug: "gulf-navy-nida-crepe", materialName: "Navy Nida Crepe", unit: MaterialUnit.METER, unitPrice: "48.00", quantity: 30, status: MaterialOrderStatus.ACCEPTED });
  await upsertMaterialOrder({ id: "matorder_seed_4", vendorSlug: "lomar", materialSlug: "gulf-gold-zip-trim", materialName: "Gold Metal Zip Trim", unit: MaterialUnit.PIECE, unitPrice: "5.50", quantity: 100, status: MaterialOrderStatus.SHIPPED, trackingNote: "Aramex 7712-889-221, picked up today." });
  await upsertMaterialOrder({ id: "matorder_seed_5", vendorSlug: "bashaer", materialSlug: "gulf-ivory-silk-lining", materialName: "Ivory Silk Lining", unit: MaterialUnit.METER, unitPrice: "30.00", quantity: 50, status: MaterialOrderStatus.COMPLETED });
  console.log("✅ Material orders (2 pending, 1 accepted, 1 shipped, 1 completed)");

  // ── A couple of customer orders (gives vendor + customer views data) ───────
  const sara = await prisma.customerProfile.findFirst({ where: { user: { email: "sara@seed.luna.ae" } }, select: { id: true, userId: true } });
  const saraAddr = await prisma.address.findFirst({ where: { userId: sara?.userId ?? "" }, select: { id: true } });
  async function firstVariant(productSlug: string) {
    return prisma.productVariant.findFirst({
      where: { product: { slug: productSlug } },
      select: { id: true, price: true, product: { select: { vendorId: true, price: true } } },
    });
  }

  if (sara && saraAddr) {
    const v1 = await firstVariant("nidaa-signature-crepe-abaya");
    const v2 = await firstVariant("lomar-travel-crinkle");
    if (v1 && v2) {
      const p1 = new Decimal(v1.product.price);
      const p2 = new Decimal(v2.product.price);
      await prisma.order.upsert({
        where: { id: "order_seed_sara_1" },
        update: {},
        create: {
          id: "order_seed_sara_1",
          customerId: sara.id,
          addressId: saraAddr.id,
          status: OrderStatus.DELIVERED,
          subtotal: p1,
          total: p1,
          paymentMethod: PaymentMethod.CARD,
          items: { create: [{ variantId: v1.id, vendorId: v1.product.vendorId, quantity: 1, unitPrice: p1, fulfillmentStatus: FulfillmentStatus.DELIVERED }] },
        },
      });
      await prisma.order.upsert({
        where: { id: "order_seed_sara_2" },
        update: {},
        create: {
          id: "order_seed_sara_2",
          customerId: sara.id,
          addressId: saraAddr.id,
          status: OrderStatus.PENDING,
          subtotal: p2,
          total: p2,
          paymentMethod: PaymentMethod.CARD,
          items: { create: [{ variantId: v2.id, vendorId: v2.product.vendorId, quantity: 1, unitPrice: p2, fulfillmentStatus: FulfillmentStatus.PENDING }] },
        },
      });
      console.log("✅ Customer orders (1 delivered, 1 pending)");
    }
  }

  console.log("🌙 Demo seed complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
