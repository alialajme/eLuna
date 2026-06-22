# Phase 2 — Plan 1: Foundation (Design Tokens, Seed, AI Wiring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Warm Oud colour tokens, create the DB seed script, and wire the Shopping Agent tools with real Prisma queries.

**Architecture:** Tailwind token update flows automatically to all three apps. Seed uses `tsx` to run a plain TypeScript script against Prisma. Shopping agent tools are refactored from module-level stubs to a factory function that closes over the customer's `SizeProfile`.

**Tech Stack:** Tailwind CSS · Prisma 5 · tsx · Vercel AI SDK · `@e-luna/db` · `@e-luna/ai`

**Run order:** Plan 1 → Plan 2 → Plan 3 → Plan 4. This plan has no dependencies on the others.

---

## File Map

| File | Action |
|---|---|
| `packages/config/tailwind/index.ts` | Modify — update 4 colour tokens |
| `packages/db/package.json` | Modify — add `tsx`, `@types/node` devDeps + `db:seed` script |
| `packages/db/prisma/seed.ts` | Create — full seed script |
| `turbo.json` | Modify — add `db:seed` task |
| `package.json` (root) | Modify — add `db:seed` script |
| `packages/ai/package.json` | Modify — add `@e-luna/db` dep |
| `packages/ai/src/agents/shopping.ts` | Modify — real tool implementations |

---

## Task 1: Update Warm Oud Design Tokens

**Files:**
- Modify: `packages/config/tailwind/index.ts`

- [ ] **Step 1: Update the four colour tokens**

Replace the existing content of `packages/config/tailwind/index.ts` with:

```ts
import type { Config } from "tailwindcss";

// Luna "Warm Oud" design tokens — approved 2026-06-22
export const lunaPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: "#1a0a00",
        ivory: "#fff8ee",
        gold: {
          DEFAULT: "#d4a855",
          light: "#f0e8d8",
        },
        sand: "#f0e8d8",
        lilac: "#c4a0f0",
        sage: "#6dbf8e",
        coral: "#e57373",
        mist: "#888888",
      },
      fontFamily: {
        display: ["var(--font-bodoni)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        arabic: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["3rem", { lineHeight: "1.1", fontWeight: "700" }],
        "display-lg": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        "display-md": ["1.75rem", { lineHeight: "1.25", fontWeight: "600" }],
        "body-xl": ["1.125rem", { lineHeight: "1.6" }],
        "body-lg": ["1rem", { lineHeight: "1.6" }],
        "body-md": ["0.875rem", { lineHeight: "1.5" }],
        "body-sm": ["0.75rem", { lineHeight: "1.5" }],
        label: ["0.625rem", { lineHeight: "1.4", letterSpacing: "0.1em", fontWeight: "700" }],
      },
    },
  },
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @e-luna/config exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/config/tailwind/index.ts
git commit -m "feat: update design tokens to Warm Oud palette"
```

---

## Task 2: Seed Script

**Files:**
- Modify: `packages/db/package.json`
- Modify: `turbo.json`
- Modify: `package.json` (root)
- Create: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Add tsx and db:seed script to packages/db/package.json**

```json
{
  "name": "@e-luna/db",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Add db:seed task to turbo.json**

Add to the `tasks` object:

```json
"db:seed": {
  "cache": false
}
```

Full `turbo.json` after edit:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:push": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Add db:seed to root package.json**

Add to the `scripts` object:

```json
"db:seed": "turbo run db:seed --filter=@e-luna/db"
```

- [ ] **Step 4: Install tsx**

```bash
pnpm install
```

Expected: tsx installed in packages/db devDeps.

- [ ] **Step 5: Create packages/db/prisma/seed.ts**

```ts
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

  // ── Lomar products ──────────────────────────────────────────────────────
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

  // ── Bashaer products ────────────────────────────────────────────────────
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

    // ── Wishlists ──────────────────────────────────────────────────────────
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
```

- [ ] **Step 6: Run the seed**

Make sure `DATABASE_URL` is set in `.env`, then:

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

Expected output:
```
🌙 Seeding Luna database…
✅ Vendors created
✅ Products and variants created
✅ Customers with size profiles created
✅ Reviews and wishlists created
🌙 Seed complete!
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/package.json packages/db/prisma/seed.ts turbo.json package.json
git commit -m "feat: add seed script with 3 boutiques, 15 products, 2 customers"
```

---

## Task 3: Wire Shopping Agent with Real Prisma Queries

**Files:**
- Modify: `packages/ai/package.json`
- Modify: `packages/ai/src/agents/shopping.ts`

- [ ] **Step 1: Add @e-luna/db to packages/ai dependencies**

Update `packages/ai/package.json`:

```json
{
  "name": "@e-luna/ai",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./shopping": "./src/agents/shopping.ts",
    "./seller": "./src/agents/seller.ts",
    "./studio": "./src/agents/studio.ts",
    "./logistics": "./src/agents/logistics.ts",
    "./payment": "./src/agents/payment.ts",
    "./pos": "./src/agents/pos.ts"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^1.2.12",
    "@e-luna/db": "workspace:*",
    "ai": "^4.3.19",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Replace packages/ai/src/agents/shopping.ts**

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import type { SizeProfile } from "@e-luna/db";
import { Decimal } from "@prisma/client/runtime/library";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SHOPPING_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Shopping Agent. Your role is to help customers find the perfect abaya or modest fashion item.
You have access to the product catalog, the customer's size profile, wishlist, and order history.
Use the customer's size profile to recommend products that will fit well.
Be specific about fabrics, fits, and styling when making recommendations.
When you find products, always mention the vendor name and price in AED.
If a customer asks to add something to their bag, confirm the product and size first.`;

type SizeGuideEntry = {
  size: string;
  bust: [number, number];
  waist: [number, number];
  hip: [number, number];
  length: number;
};
type SizeGuideJson = { entries: SizeGuideEntry[] };

function createShoppingTools(sizeProfile: SizeProfile | null) {
  return {
    search_products: tool({
      description: "Search for products by keyword, category, fabric, size, or price range",
      parameters: z.object({
        query: z.string().optional().describe("Text search query"),
        category: z.string().optional(),
        fabric: z.string().optional(),
        size: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        limit: z.number().default(5),
      }),
      execute: async ({ query, category, fabric, size, minPrice, maxPrice, limit }) => {
        const products = await prisma.product.findMany({
          where: {
            status: "ACTIVE",
            ...(category && { category: { equals: category, mode: "insensitive" } }),
            ...(fabric && { fabric: { equals: fabric, mode: "insensitive" } }),
            ...(minPrice && { price: { gte: new Decimal(minPrice) } }),
            ...(maxPrice && { price: { lte: new Decimal(maxPrice) } }),
            ...(size && { variants: { some: { size: { equals: size }, stock: { gt: 0 } } } }),
            ...(query && {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { fabric: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { vendor: { storeName: { contains: query, mode: "insensitive" } } },
              ],
            }),
          },
          include: {
            vendor: { select: { storeName: true } },
            variants: { select: { size: true, stock: true, color: true } },
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        });

        return {
          products: products.map((p) => ({
            slug: p.slug,
            title: p.title,
            price: Number(p.price),
            fabric: p.fabric,
            category: p.category,
            vendorName: p.vendor.storeName,
            availableSizes: [...new Set(p.variants.filter((v) => v.stock > 0).map((v) => v.size))],
            embed: `[PRODUCT:${p.slug}]`,
          })),
          total: products.length,
        };
      },
    }),

    recommend_size: tool({
      description: "Recommend the best size for a product based on the customer's size profile",
      parameters: z.object({
        productSlug: z.string(),
      }),
      execute: async ({ productSlug }) => {
        if (!sizeProfile) {
          return {
            recommendedSize: null,
            confidence: 0,
            note: "No size profile found. Ask the customer to set up their size profile at /profile/size for personalised recommendations.",
          };
        }

        const product = await prisma.product.findUnique({
          where: { slug: productSlug },
          select: { sizeGuide: true, title: true },
        });

        if (!product) {
          return { recommendedSize: null, confidence: 0, note: "Product not found." };
        }

        const guide = product.sizeGuide as SizeGuideJson;
        if (!guide?.entries?.length) {
          return { recommendedSize: sizeProfile.usualSize, confidence: 0.5, note: "Using your usual size — no detailed guide available." };
        }

        const bust = sizeProfile.bust;
        if (!bust) {
          return { recommendedSize: sizeProfile.usualSize, confidence: 0.6, note: "Using your usual size. Add bust measurements for a more accurate fit." };
        }

        const match = guide.entries.find((e) => bust >= e.bust[0] && bust < e.bust[1]);

        if (match) {
          const fitAdjustment = sizeProfile.fitPreference === "LOOSE" || sizeProfile.fitPreference === "OVERSIZED"
            ? ` Consider sizing up for a ${sizeProfile.fitPreference.toLowerCase()} fit.`
            : "";
          return {
            recommendedSize: match.size,
            confidence: 0.9,
            note: `Based on your bust measurement (${bust}cm), ${match.size} should fit you well.${fitAdjustment}`,
          };
        }

        return { recommendedSize: sizeProfile.usualSize, confidence: 0.7, note: `Your measurements are between sizes. Your usual size ${sizeProfile.usualSize} is a safe choice.` };
      },
    }),

    add_to_cart: tool({
      description: "Add a product variant to the customer's cart",
      parameters: z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1).default(1),
        productTitle: z.string(),
        size: z.string(),
      }),
      execute: async ({ variantId, quantity, productTitle, size }) => {
        // Cart cookie is written by the customer app's client-side handler.
        // This tool returns the signal; useChat onToolCall handles the cookie.
        return {
          success: true,
          variantId,
          quantity,
          message: `Added ${quantity}× ${productTitle} (${size}) to your bag.`,
          action: "ADD_TO_CART",
        };
      },
    }),

    style_look: tool({
      description: "Suggest complementary products that pair well with a given product",
      parameters: z.object({
        productSlug: z.string(),
        occasion: z.string().optional().describe("e.g., wedding, casual, office, travel"),
      }),
      execute: async ({ productSlug, occasion }) => {
        const product = await prisma.product.findUnique({
          where: { slug: productSlug },
          select: { fabric: true, category: true, vendorId: true },
        });

        if (!product) return { look: [], styling_tips: "" };

        const complementary = await prisma.product.findMany({
          where: {
            status: "ACTIVE",
            slug: { not: productSlug },
            ...(occasion
              ? { category: { equals: occasion === "casual" ? "Everyday" : occasion === "travel" ? "Travel" : product.category, mode: "insensitive" } }
              : { fabric: { equals: product.fabric ?? undefined, mode: "insensitive" } }
            ),
          },
          include: { vendor: { select: { storeName: true } } },
          take: 2,
        });

        return {
          look: complementary.map((p) => ({
            slug: p.slug,
            title: p.title,
            price: Number(p.price),
            vendorName: p.vendor.storeName,
            embed: `[PRODUCT:${p.slug}]`,
          })),
          styling_tips: `These pieces complement the ${product.fabric ?? "fabric"} and work well for a ${occasion ?? "polished"} look.`,
        };
      },
    }),
  };
}

export async function runShoppingAgent(
  messages: CoreMessage[],
  options?: {
    sizeProfile?: SizeProfile | null;
    sessionId?: string;
  }
) {
  const sizeProfile = options?.sizeProfile ?? null;

  const sizeContext = sizeProfile
    ? `\n\nCustomer size profile: height ${sizeProfile.height}cm, bust ${sizeProfile.bust}cm, waist ${sizeProfile.waist}cm, hip ${sizeProfile.hip}cm, usual size ${sizeProfile.usualSize}, fit preference ${sizeProfile.fitPreference}.`
    : "";

  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SHOPPING_SYSTEM + sizeContext,
    messages,
    tools: createShoppingTools(sizeProfile),
    maxSteps: 5,
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @e-luna/ai exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/package.json packages/ai/src/agents/shopping.ts
git commit -m "feat: wire Shopping Agent tools with real Prisma queries"
```

---

## Self-Check Before Handing Off to Plan 2

- [ ] `pnpm lint` passes across all packages
- [ ] `pnpm --filter @e-luna/config exec tsc --noEmit` passes
- [ ] `pnpm --filter @e-luna/ai exec tsc --noEmit` passes
- [ ] `pnpm db:seed` runs without errors
