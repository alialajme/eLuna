# e-Luna Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete e-Luna Turborepo monorepo with three Next.js 15 apps (customer, vendor, admin), five shared packages (ui, db, ai, auth, config), full Prisma schema, Clerk MFA auth for all roles, Luna design tokens, and CI/CD on Vercel — ready for feature development.

**Architecture:** Turborepo monorepo with `apps/customer`, `apps/vendor`, `apps/admin` each as independent Next.js 15 (App Router) deployments. Shared packages live in `packages/` and are consumed via workspace imports. Clerk handles auth and MFA across all apps via shared middleware in `packages/auth`. Prisma manages all database entities via `packages/db`.

**Tech Stack:** Node.js 20+, pnpm 9+, Turborepo 2+, Next.js 15 (App Router), TypeScript 5, Tailwind CSS 3, shadcn/ui, Prisma 5, PostgreSQL 16, Clerk, Vercel

---

## File Map

```
e-luna/
├── package.json                          # workspace root, pnpm workspaces
├── pnpm-workspace.yaml
├── turbo.json                            # pipeline: build, dev, lint, test, db:push
├── .gitignore
├── .env.example
│
├── apps/
│   ├── customer/                         # luna.ae
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── middleware.ts                 # Clerk route protection, CUSTOMER role guard
│   │   └── app/
│   │       ├── layout.tsx               # RootLayout: ClerkProvider, RTLProvider, fonts
│   │       ├── page.tsx                 # "/" placeholder — "Customer app coming soon"
│   │       ├── globals.css
│   │       └── (auth)/
│   │           ├── sign-in/[[...sign-in]]/page.tsx
│   │           └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── vendor/                           # sell.luna.ae
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── middleware.ts                 # Clerk route protection, VENDOR role guard
│   │   └── app/
│   │       ├── layout.tsx
│   │       ├── page.tsx                 # "/" placeholder — "Vendor app coming soon"
│   │       ├── globals.css
│   │       └── (auth)/
│   │           ├── sign-in/[[...sign-in]]/page.tsx
│   │           └── onboarding/page.tsx  # Post-signup KYC entry point placeholder
│   │
│   └── admin/                            # ops.luna.ae
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── middleware.ts                 # Clerk route protection, ADMIN role guard
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx                 # "/" placeholder — "Admin app coming soon"
│           ├── globals.css
│           └── (auth)/
│               └── sign-in/[[...sign-in]]/page.tsx
│
└── packages/
    ├── config/
    │   ├── package.json
    │   ├── eslint/index.js               # shared ESLint config (Next.js + TypeScript rules)
    │   ├── tsconfig/
    │   │   ├── base.json                # strict TypeScript base
    │   │   └── nextjs.json              # extends base, adds Next.js paths
    │   └── tailwind/
    │       └── index.ts                 # shared Tailwind preset: Luna tokens, fonts, screens
    │
    ├── ui/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tailwind.config.ts           # extends packages/config/tailwind
    │   └── src/
    │       ├── index.ts                 # barrel export of all components
    │       ├── tokens.ts                # colour + type scale constants (JS/TS)
    │       └── components/
    │           ├── RTLProvider.tsx      # dir="rtl" + Arabic font switcher
    │           ├── StatusBadge.tsx      # order/vendor/shipment status pill
    │           └── LunaLogo.tsx         # wordmark SVG component
    │
    ├── db/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── prisma/
    │   │   └── schema.prisma            # ALL entities (see Task 4)
    │   └── src/
    │       └── index.ts                 # export { prisma } singleton client
    │
    ├── auth/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                 # export roles, helpers
    │       ├── roles.ts                 # UserRole enum + role guards
    │       └── middleware.ts            # createLunaMiddleware(role) factory
    │
    └── ai/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts                 # empty barrel — wired in Phase 3
```

---

## Task 1: Initialise the Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Verify prerequisites**

```bash
node --version   # must be >= 20
pnpm --version   # must be >= 9 (install: npm i -g pnpm@latest)
```

Expected output: version numbers with no errors.

- [ ] **Step 2: Create the root directory and initialise git**

```bash
mkdir /Users/alialajme/Projects/Luna/e-luna
cd /Users/alialajme/Projects/Luna/e-luna
git init
```

- [ ] **Step 3: Create `package.json` (workspace root)**

```json
{
  "name": "e-luna",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "db:push": "turbo db:push",
    "db:generate": "turbo db:generate",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.4.0",
    "prettier": "^3.3.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Create `turbo.json`**

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
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:push": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
.next
.turbo
dist
*.env
.env.local
.env.*.local
.vercel
*.log
.DS_Store
.superpowers/
```

- [ ] **Step 7: Create `.env.example`**

```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/eluna

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

- [ ] **Step 8: Install root dependencies and verify Turborepo**

```bash
pnpm install
pnpm turbo --version
```

Expected: Turborepo version printed, no errors.

- [ ] **Step 9: Initial commit**

```bash
git add .
git commit -m "chore: initialise e-luna turborepo monorepo"
```

---

## Task 2: Shared Config Package

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/eslint/index.js`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/nextjs.json`
- Create: `packages/config/tailwind/index.ts`

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@e-luna/config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./eslint": "./eslint/index.js",
    "./tsconfig/base": "./tsconfig/base.json",
    "./tsconfig/nextjs": "./tsconfig/nextjs.json",
    "./tailwind": "./tailwind/index.ts"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/config/eslint/index.js`**

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
```

- [ ] **Step 3: Create `packages/config/tsconfig/base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "incremental": false,
    "isolatedModules": true,
    "lib": ["es2022", "dom", "dom.iterable"],
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022"
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `packages/config/tsconfig/nextjs.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "module": "esnext",
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true
  },
  "include": ["src", "app", "next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `packages/config/tailwind/index.ts`**

```ts
import type { Config } from "tailwindcss";

// Luna "Moonlit Luxury" design tokens
export const lunaPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: "#1a1a2e",
        ivory: "#fdf9f4",
        gold: {
          DEFAULT: "#c9a96e",
          light: "#e8d9c4",
        },
        sand: "#e8d9c4",
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

- [ ] **Step 6: Commit**

```bash
git add packages/config
git commit -m "chore: add shared config package (eslint, tsconfig, tailwind tokens)"
```

---

## Task 3: Scaffold the Three Next.js Apps

**Files:** `apps/customer/`, `apps/vendor/`, `apps/admin/` — full Next.js 15 App Router scaffold for each

> Run these commands from the repo root. Replace `customer` with `vendor` and `admin` for the other two apps.

- [ ] **Step 1: Create the customer app**

```bash
cd apps
pnpm create next-app@latest customer \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-turbopack
```

Repeat for vendor and admin:

```bash
pnpm create next-app@latest vendor \
  --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --no-turbopack

pnpm create next-app@latest admin \
  --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --no-turbopack
```

- [ ] **Step 2: Update each app's `package.json` to use workspace name and shared config**

Replace the contents of `apps/customer/package.json`:

```json
{
  "name": "@e-luna/customer",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0",
    "@e-luna/ui": "workspace:*",
    "@e-luna/auth": "workspace:*",
    "@e-luna/db": "workspace:*",
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.4.0"
  }
}
```

Repeat for `apps/vendor/package.json` (change name to `@e-luna/vendor`, port to 3001) and `apps/admin/package.json` (name `@e-luna/admin`, port to 3002).

- [ ] **Step 3: Replace each app's `tsconfig.json` to extend shared config**

`apps/customer/tsconfig.json`:

```json
{
  "extends": "@e-luna/config/tsconfig/nextjs",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Apply the same to `apps/vendor/tsconfig.json` and `apps/admin/tsconfig.json`.

- [ ] **Step 4: Replace each app's `tailwind.config.ts` to extend Luna preset**

`apps/customer/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
import { lunaPreset } from "@e-luna/config/tailwind";

const config: Config = {
  presets: [{ theme: lunaPreset.theme } as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
```

Apply the same content to `apps/vendor/tailwind.config.ts` and `apps/admin/tailwind.config.ts`.

- [ ] **Step 5: Add Bodoni Moda, Hanken Grotesk, and IBM Plex Sans Arabic via `next/font`**

Replace `apps/customer/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luna — The Gulf's AI-powered abaya marketplace",
  description: "Discover abayas styled for you by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${bodoni.variable} ${hanken.variable} ${ibmArabic.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

Apply the same font setup to `apps/vendor/app/layout.tsx` and `apps/admin/app/layout.tsx` (update metadata title/description appropriately).

- [ ] **Step 6: Replace each app's placeholder `app/page.tsx`**

`apps/customer/app/page.tsx`:

```tsx
export default function CustomerHome() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <p className="font-display text-display-lg text-gold">
        Luna Customer — coming soon
      </p>
    </main>
  );
}
```

`apps/vendor/app/page.tsx`:

```tsx
export default function VendorHome() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <p className="font-display text-display-lg text-gold">
        Luna Vendor OS — coming soon
      </p>
    </main>
  );
}
```

`apps/admin/app/page.tsx`:

```tsx
export default function AdminHome() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <p className="font-display text-display-lg text-gold">
        Luna Admin — coming soon
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Install all dependencies from the repo root**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm install
```

Expected: all packages resolved with no errors.

- [ ] **Step 8: Verify all three apps build**

```bash
pnpm build
```

Expected: three successful Next.js builds, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add apps/
git commit -m "chore: scaffold customer, vendor, admin Next.js 15 apps with Luna fonts and Tailwind tokens"
```

---

## Task 4: Database Schema — `packages/db`

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Create `packages/db/package.json`**

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
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.14.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "prisma": "^5.14.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the Prisma schema at `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ──────────────────────────────────────────────────────────────────

enum UserRole {
  CUSTOMER
  VENDOR
  ADMIN
}

enum MfaMethod {
  SMS
  TOTP
  WEBAUTHN
}

enum VendorStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PACKING
  SHIPPED
  DELIVERED
  CANCELLED
  RETURNED
}

enum ShipmentStatus {
  CREATED
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  RETURNED
}

enum AgentType {
  SHOPPING
  SELLER
  STUDIO
  LOGISTICS
  PAYMENT
  POS
}

enum AbayadLength {
  FULL
  MID
  SHORT
}

enum FitPreference {
  LOOSE
  FITTED
  OVERSIZED
}

enum SizeSystem {
  UAE
  UK
  EU
  US
}

// ─── Identity ───────────────────────────────────────────────────────────────

model User {
  id          String    @id                   // Clerk user ID
  email       String    @unique
  role        UserRole
  name        String
  phone       String?
  mfaEnabled  Boolean   @default(false)
  mfaMethod   MfaMethod?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  vendor          Vendor?
  customerProfile CustomerProfile?
  aiSessions      AISession[]
  notifications   Notification[]
}

model Vendor {
  id              String        @id @default(cuid())
  userId          String        @unique
  user            User          @relation(fields: [userId], references: [id])
  storeName       String
  slug            String        @unique
  logo            String?
  bio             String?
  status          VendorStatus  @default(PENDING)
  commissionRate  Float         @default(0.15)
  mfaVerifiedAt   DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  products    Product[]
  orderItems  OrderItem[]
  payouts     Payout[]
}

model CustomerProfile {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id])
  loyaltyPoints Int       @default(0)
  walletBalance Decimal   @default(0) @db.Decimal(10, 2)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sizeProfile   SizeProfile?
  orders        Order[]
  wishlists     Wishlist[]
  reviews       Review[]
  addresses     Address[]
}

// ─── Size Profile ────────────────────────────────────────────────────────────

model SizeProfile {
  id                    String         @id @default(cuid())
  customerId            String         @unique
  customer              CustomerProfile @relation(fields: [customerId], references: [id])
  height                Float?
  weight                Float?
  bust                  Float?
  waist                 Float?
  hip                   Float?
  shoulderWidth         Float?
  sleeveLength          Float?
  preferredAbayadLength AbayadLength?
  fitPreference         FitPreference?
  usualSize             String?
  sizeSystem            SizeSystem?
  updatedAt             DateTime       @updatedAt
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

model Product {
  id          String        @id @default(cuid())
  vendorId    String
  vendor      Vendor        @relation(fields: [vendorId], references: [id])
  title       String
  slug        String        @unique
  description String
  price       Decimal       @db.Decimal(10, 2)
  category    String
  fabric      String?
  aiImages    Json          @default("[]")
  sizeGuide   Json          @default("{}")
  status      ProductStatus @default(DRAFT)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  variants    ProductVariant[]
  orderItems  OrderItem[]
  wishlists   Wishlist[]
  reviews     Review[]
  studios     StudioUpload[]
}

model ProductVariant {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id])
  size      String
  color     String
  sku       String   @unique
  stock     Int      @default(0)
  price     Decimal? @db.Decimal(10, 2)

  orderItems OrderItem[]
}

// ─── Commerce ────────────────────────────────────────────────────────────────

model Address {
  id         String          @id @default(cuid())
  customerId String
  customer   CustomerProfile @relation(fields: [customerId], references: [id])
  label      String
  line1      String
  line2      String?
  city       String
  country    String          @default("AE")
  isDefault  Boolean         @default(false)

  orders Order[]
}

model Order {
  id            String      @id @default(cuid())
  customerId    String
  customer      CustomerProfile @relation(fields: [customerId], references: [id])
  addressId     String
  address       Address     @relation(fields: [addressId], references: [id])
  status        OrderStatus @default(PENDING)
  subtotal      Decimal     @db.Decimal(10, 2)
  discount      Decimal     @default(0) @db.Decimal(10, 2)
  total         Decimal     @db.Decimal(10, 2)
  paymentMethod String
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  items     OrderItem[]
  shipments Shipment[]
  payments  PaymentTransaction[]
}

model OrderItem {
  id                String         @id @default(cuid())
  orderId           String
  order             Order          @relation(fields: [orderId], references: [id])
  productId         String
  product           Product        @relation(fields: [productId], references: [id])
  variantId         String
  variant           ProductVariant @relation(fields: [variantId], references: [id])
  vendorId          String
  vendor            Vendor         @relation(fields: [vendorId], references: [id])
  quantity          Int
  unitPrice         Decimal        @db.Decimal(10, 2)
  fulfillmentStatus String         @default("PENDING")
}

model Shipment {
  id                String         @id @default(cuid())
  orderId           String
  order             Order          @relation(fields: [orderId], references: [id])
  courier           String
  trackingNumber    String?
  status            ShipmentStatus @default(CREATED)
  estimatedDelivery DateTime?
  cost              Decimal        @db.Decimal(10, 2)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
}

model Review {
  id         String          @id @default(cuid())
  customerId String
  customer   CustomerProfile @relation(fields: [customerId], references: [id])
  productId  String
  product    Product         @relation(fields: [productId], references: [id])
  rating     Int
  body       String?
  photoUrl   String?
  createdAt  DateTime        @default(now())
}

model Wishlist {
  id         String          @id @default(cuid())
  customerId String
  customer   CustomerProfile @relation(fields: [customerId], references: [id])
  productId  String
  product    Product         @relation(fields: [productId], references: [id])
  createdAt  DateTime        @default(now())

  @@unique([customerId, productId])
}

// ─── Finance ─────────────────────────────────────────────────────────────────

model PaymentTransaction {
  id         String   @id @default(cuid())
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id])
  provider   String
  externalId String?
  amount     Decimal  @db.Decimal(10, 2)
  status     String
  createdAt  DateTime @default(now())
}

model Payout {
  id        String   @id @default(cuid())
  vendorId  String
  vendor    Vendor   @relation(fields: [vendorId], references: [id])
  amount    Decimal  @db.Decimal(10, 2)
  status    String   @default("PENDING")
  iban      String
  processedAt DateTime?
  createdAt DateTime @default(now())
}

// ─── AI ──────────────────────────────────────────────────────────────────────

model AISession {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  agentType AgentType
  messages  Json      @default("[]")
  context   Json      @default("{}")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model StudioUpload {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  frontUrl    String
  backUrl     String
  openUrl     String
  result      Json?
  status      String   @default("PENDING")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ─── Notifications ───────────────────────────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String
  title     String
  body      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model LoyaltyTransaction {
  id         String   @id @default(cuid())
  customerId String
  points     Int
  reason     String
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 4: Create `packages/db/src/index.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
```

- [ ] **Step 5: Create `.env` from the example (fill in your local DB URL)**

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL to your local PostgreSQL connection string
# e.g. DATABASE_URL=postgresql://postgres:password@localhost:5432/eluna
```

- [ ] **Step 6: Install db package dependencies and generate Prisma client**

```bash
pnpm install
pnpm --filter @e-luna/db db:generate
```

Expected: `✔ Generated Prisma Client` in output.

- [ ] **Step 7: Push schema to database**

```bash
pnpm --filter @e-luna/db db:push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat: add complete Prisma schema with all e-luna entities"
```

---

## Task 5: Auth Package + Clerk Integration

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/roles.ts`
- Create: `packages/auth/src/middleware.ts`
- Create: `packages/auth/src/index.ts`
- Modify: `apps/customer/middleware.ts`
- Modify: `apps/vendor/middleware.ts`
- Modify: `apps/admin/middleware.ts`
- Create: `apps/customer/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/customer/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- Create: `apps/vendor/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/vendor/app/(auth)/onboarding/page.tsx`
- Create: `apps/admin/app/(auth)/sign-in/[[...sign-in]]/page.tsx`

> **Before this task:** Create a Clerk application at dashboard.clerk.com. Create three separate Clerk apps (customer, vendor, admin) or use one app with metadata-based roles. Copy the publishable key and secret key into `.env`.

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@e-luna/auth",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "next": "15.0.0",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "next": ">=15"
  }
}
```

- [ ] **Step 2: Create `packages/auth/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "compilerOptions": {
    "paths": {}
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/auth/src/roles.ts`**

```ts
export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN";

export function isCustomer(role: UserRole | null | undefined): boolean {
  return role === "CUSTOMER";
}

export function isVendor(role: UserRole | null | undefined): boolean {
  return role === "VENDOR";
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "ADMIN";
}

// Role is stored on Clerk's publicMetadata: { role: UserRole }
export function getRoleFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): UserRole | null {
  const role = metadata?.role;
  if (role === "CUSTOMER" || role === "VENDOR" || role === "ADMIN") return role;
  return null;
}
```

- [ ] **Step 4: Create `packages/auth/src/middleware.ts`**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "./roles";
import { getRoleFromMetadata } from "./roles";

/**
 * Factory that returns a Clerk middleware scoped to a required role.
 * Public routes (sign-in, sign-up) are excluded from auth checks.
 */
export function createLunaMiddleware(requiredRole: UserRole) {
  const isPublicRoute = createRouteMatcher([
    "/sign-in(.*)",
    "/sign-up(.*)",
  ]);

  return clerkMiddleware(async (auth, request) => {
    if (isPublicRoute(request)) return NextResponse.next();

    const { userId, sessionClaims } = await auth();

    if (!userId) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("redirect_url", request.url);
      return NextResponse.redirect(signInUrl);
    }

    const role = getRoleFromMetadata(
      sessionClaims?.metadata as Record<string, unknown>
    );

    if (role !== requiredRole) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    return NextResponse.next();
  });
}
```

- [ ] **Step 5: Create `packages/auth/src/index.ts`**

```ts
export { createLunaMiddleware } from "./middleware";
export { getRoleFromMetadata, isAdmin, isCustomer, isVendor } from "./roles";
export type { UserRole } from "./roles";
```

- [ ] **Step 6: Create `apps/customer/middleware.ts`**

```ts
import { createLunaMiddleware } from "@e-luna/auth";

export default createLunaMiddleware("CUSTOMER");

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: Create `apps/vendor/middleware.ts`**

```ts
import { createLunaMiddleware } from "@e-luna/auth";

export default createLunaMiddleware("VENDOR");

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 8: Create `apps/admin/middleware.ts`**

```ts
import { createLunaMiddleware } from "@e-luna/auth";

export default createLunaMiddleware("ADMIN");

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 9: Add Clerk sign-in page to customer app**

Create `apps/customer/app/(auth)/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignIn />
    </main>
  );
}
```

Create `apps/customer/app/(auth)/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 10: Add Clerk sign-in page to vendor app**

Create `apps/vendor/app/(auth)/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function VendorSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignIn />
    </main>
  );
}
```

Create `apps/vendor/app/(auth)/onboarding/page.tsx`:

```tsx
// Onboarding is wired in Phase 2 (Vendor OS). This is the placeholder.
export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <p className="font-sans text-body-lg text-gold">
        Vendor onboarding — coming in Phase 2
      </p>
    </main>
  );
}
```

- [ ] **Step 11: Add Clerk sign-in page to admin app**

Create `apps/admin/app/(auth)/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function AdminSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 12: Configure MFA in Clerk Dashboard**

In the Clerk dashboard for each app:
1. Go to **User & Authentication → Multi-factor authentication**
2. Set strategy:
   - Customer app: Enable **SMS OTP** and **Authenticator app** (optional for customers, prompted after first sign-in)
   - Vendor app: Enable **Authenticator app** and set to **Required**
   - Admin app: Enable **Hardware key (WebAuthn)** and set to **Required**

This is a dashboard configuration step, not a code step.

- [ ] **Step 13: Build and verify**

```bash
pnpm build
```

Expected: all three apps build cleanly. Navigating to any protected route in the browser should redirect to `/sign-in`.

- [ ] **Step 14: Commit**

```bash
git add packages/auth apps/customer/middleware.ts apps/vendor/middleware.ts apps/admin/middleware.ts \
  apps/customer/app/\(auth\) apps/vendor/app/\(auth\) apps/admin/app/\(auth\)
git commit -m "feat: add Clerk auth with role-scoped middleware and MFA configuration across all three apps"
```

---

## Task 6: UI Package — Design Tokens + Base Components

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/src/tokens.ts`
- Create: `packages/ui/src/components/RTLProvider.tsx`
- Create: `packages/ui/src/components/StatusBadge.tsx`
- Create: `packages/ui/src/components/LunaLogo.tsx`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@e-luna/ui",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "@types/react": "^19",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "react": ">=19"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "compilerOptions": {
    "jsx": "react-jsx",
    "paths": {}
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/ui/src/tokens.ts`**

```ts
export const colors = {
  ink: "#1a1a2e",
  ivory: "#fdf9f4",
  gold: "#c9a96e",
  sand: "#e8d9c4",
  lilac: "#c4a0f0",
  sage: "#6dbf8e",
  coral: "#e57373",
  mist: "#888888",
} as const;

export type ColorToken = keyof typeof colors;
```

- [ ] **Step 4: Create `packages/ui/src/components/RTLProvider.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

type Direction = "ltr" | "rtl";

const DirectionContext = createContext<Direction>("ltr");

export function RTLProvider({
  children,
  dir = "ltr",
}: {
  children: React.ReactNode;
  dir?: Direction;
}) {
  return (
    <DirectionContext.Provider value={dir}>
      <div dir={dir} className={dir === "rtl" ? "font-arabic" : "font-sans"}>
        {children}
      </div>
    </DirectionContext.Provider>
  );
}

export function useDirection(): Direction {
  return useContext(DirectionContext);
}
```

- [ ] **Step 5: Create `packages/ui/src/components/StatusBadge.tsx`**

```tsx
type StatusVariant =
  | "pending"
  | "active"
  | "confirmed"
  | "packing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "suspended";

const variantStyles: Record<StatusVariant, string> = {
  pending:   "bg-sand text-ink",
  active:    "bg-sage/20 text-sage",
  confirmed: "bg-gold/20 text-gold",
  packing:   "bg-lilac/20 text-lilac",
  shipped:   "bg-gold/30 text-ink",
  delivered: "bg-sage/30 text-sage",
  cancelled: "bg-coral/20 text-coral",
  returned:  "bg-coral/10 text-coral",
  suspended: "bg-mist/20 text-mist",
};

export function StatusBadge({ status }: { status: StatusVariant }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-label uppercase tracking-widest ${variantStyles[status]}`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 6: Create `packages/ui/src/components/LunaLogo.tsx`**

```tsx
export function LunaLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display text-display-md tracking-tight text-gold ${className}`}
      aria-label="Luna"
    >
      Luna
    </span>
  );
}
```

- [ ] **Step 7: Create the barrel export `packages/ui/src/index.ts`**

```ts
export { RTLProvider, useDirection } from "./components/RTLProvider";
export { StatusBadge } from "./components/StatusBadge";
export { LunaLogo } from "./components/LunaLogo";
export { colors } from "./tokens";
export type { ColorToken } from "./tokens";
```

- [ ] **Step 8: Import LunaLogo into each app's placeholder page to verify package resolution**

Edit `apps/customer/app/page.tsx`:

```tsx
import { LunaLogo } from "@e-luna/ui";

export default function CustomerHome() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <LunaLogo className="text-display-xl" />
    </main>
  );
}
```

Apply the same import to `apps/vendor/app/page.tsx` and `apps/admin/app/page.tsx`.

- [ ] **Step 9: Build to verify cross-package imports resolve**

```bash
pnpm build
```

Expected: all three apps build cleanly with `LunaLogo` rendering via `@e-luna/ui`.

- [ ] **Step 10: Commit**

```bash
git add packages/ui apps/customer/app/page.tsx apps/vendor/app/page.tsx apps/admin/app/page.tsx
git commit -m "feat: add UI package with Luna design tokens, RTLProvider, StatusBadge, LunaLogo"
```

---

## Task 7: Empty AI Package Scaffold

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/index.ts`

- [ ] **Step 1: Create `packages/ai/package.json`**

```json
{
  "name": "@e-luna/ai",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "ai": "^3.3.0",
    "@anthropic-ai/sdk": "^0.27.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/ai/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "compilerOptions": { "paths": {} },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/ai/src/index.ts`**

```ts
// AI agents are wired in Phase 3. This package is scaffolded for dependency resolution.
export {};
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai
git commit -m "chore: scaffold packages/ai — agents wired in Phase 3"
```

---

## Task 8: Vercel CI/CD Configuration

**Files:**
- Create: `vercel.json` (root)
- Create: `apps/customer/.env.local.example`
- Create: `apps/vendor/.env.local.example`
- Create: `apps/admin/.env.local.example`

- [ ] **Step 1: Create root `vercel.json` for monorepo**

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true
    }
  }
}
```

- [ ] **Step 2: Create per-app `.env.local.example` files**

`apps/customer/.env.local.example`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

Repeat the same file for `apps/vendor/.env.local.example` and `apps/admin/.env.local.example`.

- [ ] **Step 3: Connect to Vercel**

```bash
# Install Vercel CLI if not already installed
pnpm add -g vercel

# From repo root — link to a new Vercel project
vercel link
```

In the Vercel dashboard, create three separate Vercel projects (one per app):
- `e-luna-customer` → Root directory: `apps/customer`
- `e-luna-vendor` → Root directory: `apps/vendor`
- `e-luna-admin` → Root directory: `apps/admin`

Set environment variables for each project via the Vercel dashboard (copy from the respective `.env.local.example`).

- [ ] **Step 4: Final full build and lint**

```bash
pnpm build
pnpm lint
```

Expected: all three apps build and lint cleanly with zero errors.

- [ ] **Step 5: Final commit**

```bash
git add vercel.json apps/customer/.env.local.example apps/vendor/.env.local.example apps/admin/.env.local.example
git commit -m "chore: add Vercel monorepo configuration for all three apps"
```

---

## Task 9: Smoke Test — End-to-End Foundation Verification

No new files. Verify the complete foundation works before proceeding to Phase 1, Sub-project 2.

- [ ] **Step 1: Start all three apps in dev mode**

```bash
pnpm dev
```

Expected: three Next.js dev servers start:
- `http://localhost:3000` — customer
- `http://localhost:3001` — vendor
- `http://localhost:3002` — admin

- [ ] **Step 2: Verify protected route redirect on customer app**

Open `http://localhost:3000` in a browser (not signed in).  
Expected: redirected to `http://localhost:3000/sign-in`.

- [ ] **Step 3: Verify protected route redirect on vendor app**

Open `http://localhost:3001` in a browser.  
Expected: redirected to `http://localhost:3001/sign-in`.

- [ ] **Step 4: Verify protected route redirect on admin app**

Open `http://localhost:3002` in a browser.  
Expected: redirected to `http://localhost:3002/sign-in`.

- [ ] **Step 5: Verify database connection**

```bash
pnpm --filter @e-luna/db db:studio
```

Expected: Prisma Studio opens at `http://localhost:5555` showing all tables (User, Vendor, CustomerProfile, SizeProfile, Product, Order, etc.) with zero rows.

- [ ] **Step 6: Verify Luna fonts load on customer app**

Sign in as a CUSTOMER in Clerk (create a test user via Clerk dashboard, set `publicMetadata: { role: "CUSTOMER" }`).  
Open `http://localhost:3000` — should show "Luna" in Bodoni Moda font in gold on ink background.

- [ ] **Step 7: Tag the foundation release and push**

```bash
git tag v0.1.0-foundation
git push origin main --tags
```

---

## Post-Foundation

With this plan complete, the following are ready:
- `apps/customer`, `apps/vendor`, `apps/admin` — running, auth-protected, role-scoped
- `packages/db` — full Prisma schema pushed to PostgreSQL
- `packages/auth` — Clerk MFA middleware for all three roles
- `packages/ui` — Luna design tokens and three base components
- `packages/ai` — scaffolded for Phase 3
- CI/CD — Vercel projects configured for all three apps

**Next plan:** `2026-06-22-phase-1-storefront.md` (Sub-project 2 — Customer Storefront)
