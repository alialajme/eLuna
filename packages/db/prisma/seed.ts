import { PrismaClient, UserRole, VendorStatus, ProductStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

const STANDARD_SIZE_GUIDE = {
  entries: [
    { size: "XS", bust: [80, 86], waist: [64, 70], hip: [88, 94], length: 138 },
    { size: "S",  bust: [86, 92], waist: [70, 76], hip: [94, 100], length: 140 },
    { size: "M",  bust: [92, 98], waist: [76, 82], hip: [100, 106], length: 142 },
    { size: "L",  bust: [98, 104], waist: [82, 88], hip: [106, 112], length: 144 },
    { size: "XL", bust: [104, 110], waist: [88, 94], hip: [112, 118], length: 146 },
    { size: "XXL", bust: [110, 118], waist: [94, 102], hip: [118, 126], length: 148 },
  ],
};

async function main() {
  console.log("🌙 Seeding Luna database…");

  // ── Vendor 1: Nidaa Studio (Occasion & Formal, Dubai) ──────────────────
  const nidaaUser = await prisma.user.upsert({
    where: { email: "nidaa@seed.luna.ae" },
    update: {},
    create: {
      id: "user_seed_vendor_nidaa",
      email: "nidaa@seed.luna.ae",
      role: UserRole.VENDOR,
      mfaEnabled: true,
    },
  });

  const nidaaVendor = await prisma.vendor.upsert({
    where: { storeSlug: "nidaa-studio" },
    update: {},
    create: {
      userId: nidaaUser.id,
      storeName: "Nidaa Studio",
      storeSlug: "nidaa-studio",
      description: "Handcrafted occasion abayas from Dubai",
      status: VendorStatus.ACTIVE,
      commissionRate: new Decimal("0.15"),
    },
  });

  // ── Vendor 2: Lomar (Everyday & Travel, Riyadh) ─────────────────────────
  const lomarUser = await prisma.user.upsert({
    where: { email: "lomar@seed.luna.ae" },
    update: {},
    create: {
      id: "user_seed_vendor_lomar",
      email: "lomar@seed.luna.ae",
      role: UserRole.VENDOR,
      mfaEnabled: true,
    },
  });

  const lomarVendor = await prisma.vendor.upsert({
    where: { storeSlug: "lomar" },
    update: {},
    create: {
      userId: lomarUser.id,
      storeName: "Lomar",
      storeSlug: "lomar",
      description: "Contemporary abayas for the modern Gulf woman",
      status: VendorStatus.ACTIVE,
      commissionRate: new Decimal("0.15"),
    },
  });

  // ── Vendor 3: Bashaer (Sport & Activewear, Abu Dhabi) ───────────────────
  const bashaerUser = await prisma.user.upsert({
    where: { email: "bashaer@seed.luna.ae" },
    update: {},
    create: {
      id: "user_seed_vendor_bashaer",
      email: "bashaer@seed.luna.ae",
      role: UserRole.VENDOR,
      mfaEnabled: true,
    },
  });

  const bashaerVendor = await prisma.vendor.upsert({
    where: { storeSlug: "bashaer" },
    update: {},
    create: {
      userId: bashaerUser.id,
      storeName: "Bashaer",
      storeSlug: "bashaer",
      description: "Modest activewear and sport abayas, Abu Dhabi",
      status: VendorStatus.ACTIVE,
      commissionRate: new Decimal("0.12"),
    },
  });

  console.log("✅ Vendors created");

  // ── Nidaa Studio products ───────────────────────────────────────────────
  const nidaaProducts = [
    {
      title: "Signature Crepe Abaya",
      slug: "nidaa-signature-crepe-abaya",
      category: "Occasion",
      fabric: "Crepe",
      price: new Decimal("850"),
      description: "A timeless occasion abaya in premium crepe with delicate embroidery detail.",
    },
    {
      title: "Pearl Embroidered Evening Abaya",
      slug: "nidaa-pearl-embroidered-evening",
      category: "Occasion",
      fabric: "Silk",
      price: new Decimal("1400"),
      description: "Hand-embroidered pearl detailing on flowing silk. Perfect for weddings.",
    },
    {
      title: "Structured Shoulder Abaya",
      slug: "nidaa-structured-shoulder",
      category: "Occasion",
      fabric: "Nidha",
      price: new Decimal("1100"),
      description: "Modern structured silhouette in luxurious Nidha fabric.",
    },
    {
      title: "Classic Open Front Abaya",
      slug: "nidaa-classic-open-front",
      category: "Everyday",
      fabric: "Crepe",
      price: new Decimal("650"),
      description: "Versatile open-front design in lightweight crepe.",
    },
    {
      title: "Lace Trim Occasion Abaya",
      slug: "nidaa-lace-trim-occasion",
      category: "Occasion",
      fabric: "Silk",
      price: new Decimal("1800"),
      description: "Delicate French lace trim with an ivory silk lining.",
    },
  ];

  const lomarProductsData = [
    {
      title: "Everyday Linen Abaya",
      slug: "lomar-everyday-linen",
      category: "Everyday",
      fabric: "Linen",
      price: new Decimal("420"),
      description: "Breathable linen blend, perfect for daily wear in warm climates.",
    },
    {
      title: "Travel Crinkle Abaya",
      slug: "lomar-travel-crinkle",
      category: "Travel",
      fabric: "Crepe",
      price: new Decimal("380"),
      description: "Crinkle-resistant fabric — pack it, unpack it, look effortless.",
    },
    {
      title: "Convertible Travel Set",
      slug: "lomar-convertible-travel-set",
      category: "Travel",
      fabric: "Jersey",
      price: new Decimal("550"),
      description: "Two-piece set that converts from abaya to wide-leg palazzo look.",
    },
    {
      title: "Minimal Everyday Abaya",
      slug: "lomar-minimal-everyday",
      category: "Everyday",
      fabric: "Nidha",
      price: new Decimal("490"),
      description: "Clean lines, zero fuss. The everyday essential.",
    },
    {
      title: "Casual Hoodie Abaya",
      slug: "lomar-casual-hoodie",
      category: "Everyday",
      fabric: "Jersey",
      price: new Decimal("320"),
      description: "Relaxed jersey hoodie abaya for weekends and errands.",
    },
  ];

  const bashaerProductsData = [
    {
      title: "Sport Zip Abaya",
      slug: "bashaer-sport-zip",
      category: "Sport",
      fabric: "Jersey",
      price: new Decimal("280"),
      description: "Full-length zip sport abaya in moisture-wicking jersey.",
    },
    {
      title: "Active Modest Tracksuit Abaya",
      slug: "bashaer-active-tracksuit",
      category: "Sport",
      fabric: "Jersey",
      price: new Decimal("350"),
      description: "Coordinated set with inner pants and sport abaya overlay.",
    },
    {
      title: "Yoga-Friendly Abaya",
      slug: "bashaer-yoga-friendly",
      category: "Sport",
      fabric: "Jersey",
      price: new Decimal("260"),
      description: "Four-way stretch jersey. Moves with you, stays modest.",
    },
    {
      title: "Swim Modesty Cover",
      slug: "bashaer-swim-modesty-cover",
      category: "Sport",
      fabric: "Jersey",
      price: new Decimal("220"),
      description: "Quick-dry UV-protective cover for beach and pool.",
    },
    {
      title: "Performance Walk Abaya",
      slug: "bashaer-performance-walk",
      category: "Sport",
      fabric: "Linen",
      price: new Decimal("310"),
      description: "Lightweight performance linen for morning walks and outdoor activity.",
    },
  ];

  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  async function createProductWithVariants(
    vendorId: string,
    data: typeof nidaaProducts[0],
    colorOptions: string[]
  ) {
    const product = await prisma.product.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        vendorId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        price: data.price,
        category: data.category,
        fabric: data.fabric,
        status: ProductStatus.ACTIVE,
        aiImages: [],
        sizeGuide: STANDARD_SIZE_GUIDE,
      },
    });

    for (const size of sizes) {
      for (const color of colorOptions) {
        const sku = `${data.slug}-${size}-${color}`.toLowerCase().replace(/\s+/g, "-");
        await prisma.productVariant.upsert({
          where: { sku },
          update: {},
          create: {
            productId: product.id,
            size,
            color,
            sku,
            stock: Math.floor(Math.random() * 15) + 1,
          },
        });
      }
    }

    return product;
  }

  const nidaaProductRecords = await Promise.all(
    nidaaProducts.map((p) => createProductWithVariants(nidaaVendor.id, p, ["Black", "Navy"]))
  );

  const lomarProductRecords = await Promise.all(
    lomarProductsData.map((p) => createProductWithVariants(lomarVendor.id, p, ["Black"]))
  );

  const bashaerProductRecords = await Promise.all(
    bashaerProductsData.map((p) => createProductWithVariants(bashaerVendor.id, p, ["Black", "Grey"]))
  );

  console.log("✅ Products and variants created");

  // ── Customer 1: Petite profile ──────────────────────────────────────────
  const customer1User = await prisma.user.upsert({
    where: { email: "sara@seed.luna.ae" },
    update: {},
    create: {
      id: "user_seed_customer_sara",
      email: "sara@seed.luna.ae",
      role: UserRole.CUSTOMER,
      mfaEnabled: true,
      customerProfile: {
        create: {
          sizeProfile: {
            create: {
              height: 155,
              bust: 86,
              waist: 68,
              hip: 92,
              usualSize: "S",
              fitPreference: "REGULAR",
              preferredAbayaLength: "FLOOR",
              sizeSystem: "INTL",
            },
          },
          addresses: {
            create: {
              label: "Home",
              fullName: "Sara Al Mansoori",
              phone: "+971501234567",
              addressLine1: "Villa 12, Al Wasl Road",
              city: "Dubai",
              emirate: "Dubai",
              country: "AE",
              isDefault: true,
            },
          },
        },
      },
    },
  });

  // ── Customer 2: Standard profile ────────────────────────────────────────
  const customer2User = await prisma.user.upsert({
    where: { email: "layla@seed.luna.ae" },
    update: {},
    create: {
      id: "user_seed_customer_layla",
      email: "layla@seed.luna.ae",
      role: UserRole.CUSTOMER,
      mfaEnabled: true,
      customerProfile: {
        create: {
          sizeProfile: {
            create: {
              height: 165,
              bust: 96,
              waist: 78,
              hip: 104,
              usualSize: "M",
              fitPreference: "LOOSE",
              preferredAbayaLength: "FLOOR",
              sizeSystem: "INTL",
            },
          },
          addresses: {
            create: {
              label: "Home",
              fullName: "Layla Al Hashemi",
              phone: "+971502345678",
              addressLine1: "Apartment 7B, Corniche Tower",
              city: "Abu Dhabi",
              emirate: "Abu Dhabi",
              country: "AE",
              isDefault: true,
            },
          },
        },
      },
    },
  });

  console.log("✅ Customers with size profiles created");

  // ── Reviews ─────────────────────────────────────────────────────────────
  const sara = await prisma.customerProfile.findUnique({
    where: { userId: customer1User.id },
  });
  const layla = await prisma.customerProfile.findUnique({
    where: { userId: customer2User.id },
  });

  if (sara && layla) {
    const reviewData = [
      { customerProfileId: sara.id, productId: nidaaProductRecords[0].id, rating: 5, body: "Beautiful quality, fits perfectly in small. The fabric is so soft." },
      { customerProfileId: sara.id, productId: lomarProductRecords[1].id, rating: 4, body: "Great for travel, no creases at all after a 6-hour flight." },
      { customerProfileId: sara.id, productId: bashaerProductRecords[0].id, rating: 5, body: "The sport zip abaya is perfect for my morning walks." },
      { customerProfileId: layla.id, productId: nidaaProductRecords[1].id, rating: 5, body: "Wore this to a wedding — received so many compliments." },
      { customerProfileId: layla.id, productId: lomarProductRecords[0].id, rating: 4, body: "Love the linen, very breathable in the Dubai heat." },
      { customerProfileId: layla.id, productId: bashaerProductRecords[2].id, rating: 5, body: "Finally a yoga abaya that actually stays in place!" },
    ];

    for (const review of reviewData) {
      await prisma.review.upsert({
        where: {
          customerProfileId_productId: {
            customerProfileId: review.customerProfileId,
            productId: review.productId,
          },
        },
        update: {},
        create: { ...review, isVerified: true },
      });
    }

    await prisma.wishlist.upsert({
      where: { customerProfileId_productId: { customerProfileId: sara.id, productId: nidaaProductRecords[2].id } },
      update: {},
      create: { customerProfileId: sara.id, productId: nidaaProductRecords[2].id },
    });

    await prisma.wishlist.upsert({
      where: { customerProfileId_productId: { customerProfileId: layla.id, productId: lomarProductRecords[2].id } },
      update: {},
      create: { customerProfileId: layla.id, productId: lomarProductRecords[2].id },
    });
  }

  console.log("✅ Reviews and wishlists created");
  console.log("🌙 Seed complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
