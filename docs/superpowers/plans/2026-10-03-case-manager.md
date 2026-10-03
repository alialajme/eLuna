# Case Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AYVANA's Case Manager — multi-channel (website/mobile/WhatsApp) complaint/suggestion/question intake for customer/vendor/supplier openers, with a call-center/support/admin console in the admin app, keyless-first.

**Architecture:** Case domain + state machine live in `@ayvana/db` (pure, append-only `CaseEvent` + transactional `OutboxEvent`, no external deps). WhatsApp is a credential-gated `@ayvana/messaging` gateway with a `SimulatedMessaging` fallback. A new `@ayvana/cases` worker package drains the outbox (WhatsApp dispatch, in-app `Notification` writes, SLA sweep, AI auto-triage). Shared opener UI (`CaseSubmitForm`/`CaseThread`/`CaseStatusBadge`) lives in `@ayvana/ui`; each app wraps it with session-resolved identity + its own server action. An AI triage agent lives in `@ayvana/ai`.

**Tech Stack:** Turborepo + pnpm workspaces · Next.js 15 (App Router, RSC + server actions) · TypeScript strict · Prisma + PostgreSQL (`prisma db push`, NO migration files) · Vitest integration tests against `ayvana_test` · Expo/React Native (`apps/mobile`) · Vercel AI SDK + Claude.

**Conventions (non-negotiable):**
- `cuid()` PKs; `Decimal @db.Decimal(10,2)` money; `createdAt`/`updatedAt`; UpperCamelCase enums; status included in filter indexes.
- Schema changes are applied with `prisma db push` to BOTH the `eluna` dev DB and `ayvana_test`. Never create migration files.
- Keyless-first: unconfigured gateways degrade to `Simulated*`; factories never throw.
- The uncommitted **demo shim must never be staged**. Every commit uses `git add <explicit feature paths>` — never `git add -A` / `git add .`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Run a package's tests with `pnpm --filter <pkg> test`.

---

## File Structure

**`@ayvana/db`** (schema + pure domain)
- `packages/db/prisma/schema.prisma` — +4 models (`Case`, `CaseMessage`, `CaseCategory`, `CaseEvent`), +8 enums, extend `UserRole`/`AIAgentType`/`NotificationType`.
- `packages/db/src/case-status.ts` — state machine (`CASE_TRANSITIONS`, `assertCaseTransition`) + `SLA_HOURS` + `caseSlaDueDates()`.
- `packages/db/src/cases.ts` — domain helpers: `createCase`, `addCaseMessage`, `assignCase`, `transitionCase`, `resolveCase`, `reopenCase`, `applyCaseTriage`, read helpers `listCases`/`getCaseDetail`.
- `packages/db/src/case-seed.ts` — `seedCaseCategories()`.
- `packages/db/src/index.ts` — export the two new modules.
- `packages/db/vitest.config.ts` + `packages/db/test/{setup.ts,factories.ts,*.int.test.ts}` — integration tests (new; mirrors `packages/studio/test`).
- `packages/db/package.json` — add `test` script + vitest/dotenv/tsx devDeps.

**`@ayvana/messaging`** (new gated gateway package)
- `packages/messaging/{package.json,tsconfig.json,vitest.config.ts}`
- `packages/messaging/src/{gateway,config,simulated,whatsapp,factory,index}.ts`
- `packages/messaging/test/messaging.test.ts`

**`@ayvana/auth`**
- `packages/auth/src/roles.ts` — add `SUPPORT`, `CALL_CENTER`.

**`@ayvana/ui`** (shared opener/handler UI)
- `packages/ui/src/components/{CaseStatusBadge,CaseSubmitForm,CaseThread}.tsx`
- `packages/ui/src/index.ts` — export them.

**`@ayvana/ai`**
- `packages/ai/src/agents/case.ts` — `runCaseAgent` (read-only tools) + `classifyCase()`.
- `packages/ai/src/session.ts` — add `"CASE"` to `AGENT_TYPES`.

**`@ayvana/cases`** (new worker package — side effects)
- `packages/cases/{package.json,tsconfig.json}`
- `packages/cases/src/{handlers,worker,index}.ts` + `packages/cases/test/handlers.int.test.ts`

**`apps/admin`** (handler console)
- `apps/admin/app/(dashboard)/cases/{page.tsx,[id]/page.tsx}`
- `apps/admin/app/(dashboard)/cases/components/{CaseActions,CaseComposer}.tsx`
- `apps/admin/app/actions/cases.ts`
- `apps/admin/app/(dashboard)/components/Sidebar.tsx` — add Cases nav entry.

**Opener web** (`apps/customer`, `apps/vendor`, `apps/supplier`)
- `apps/<app>/app/.../support/{page.tsx,new/page.tsx,[id]/page.tsx}` + `apps/<app>/app/.../support/actions.ts`

**Mobile** (`apps/customer` API + `apps/mobile` screens)
- `apps/customer/app/api/mobile/cases/{route.ts,[id]/route.ts,[id]/messages/route.ts}`
- `apps/mobile/src/screens/support/{SupportListScreen,NewCaseScreen,CaseThreadScreen}.tsx` + `apps/mobile/src/lib/cases.ts`

**WhatsApp webhook**
- `apps/customer/app/api/webhooks/whatsapp/route.ts`

---

## Task 1: Schema — Case models, enums, role & agent-type extensions

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/vitest.config.ts`, `packages/db/test/setup.ts`, `packages/db/test/factories.ts`, `packages/db/test/schema.int.test.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Extend the three existing enums** in `packages/db/prisma/schema.prisma`. Change `enum UserRole`, `enum AIAgentType`, `enum NotificationType` to:

```prisma
enum UserRole {
  CUSTOMER
  VENDOR
  ADMIN
  SUPPLIER
  SUPPORT
  CALL_CENTER
}

enum AIAgentType {
  SHOPPING
  SELLER
  STUDIO
  LOGISTICS
  PAYMENT
  POS
  SUPPLIER
  CASE
}

enum NotificationType {
  ORDER_UPDATE
  PAYMENT_UPDATE
  PROMOTION
  AI_SUGGESTION
  SYSTEM
  CASE_UPDATE
}
```

- [ ] **Step 2: Append the Case enums + models** to the end of `packages/db/prisma/schema.prisma`:

```prisma
// ─────────────────────────────────────────────
// CASE MANAGER
// ─────────────────────────────────────────────

enum CaseType {
  COMPLAINT
  SUGGESTION
  QUESTION
}

enum CaseStatus {
  NEW
  ASSIGNED
  IN_PROGRESS
  WAITING_CUSTOMER
  RESOLVED
  CLOSED
  CANCELLED
}

enum CasePriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum CaseChannel {
  WEBSITE
  MOBILE
  WHATSAPP
}

enum CaseOpenerRole {
  CUSTOMER
  VENDOR
  SUPPLIER
}

enum CaseAuthorRole {
  CUSTOMER
  VENDOR
  SUPPLIER
  SUPPORT
  CALL_CENTER
  ADMIN
  SYSTEM
}

enum CaseTeam {
  SUPPORT
  CALL_CENTER
}

enum CaseEventType {
  CREATED
  ASSIGNED
  STATUS_CHANGED
  MESSAGE
  ESCALATED
  RESOLVED
  REOPENED
  CATEGORY_CHANGED
  PRIORITY_CHANGED
}

model CaseCategory {
  id              String       @id @default(cuid())
  slug            String       @unique
  name            String
  description     String?
  defaultPriority CasePriority @default(MEDIUM)
  defaultTeam     CaseTeam?
  isActive        Boolean      @default(true)
  sortOrder       Int          @default(0)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  cases Case[]

  @@index([isActive, sortOrder])
}

model Case {
  id          String       @id @default(cuid())
  caseNumber  String       @unique
  type        CaseType
  categoryId  String
  channel     CaseChannel
  status      CaseStatus   @default(NEW)
  priority    CasePriority @default(MEDIUM)
  subject     String
  description String

  openerUserId String?
  openerRole   CaseOpenerRole
  contactName  String
  contactEmail String?
  contactPhone String?

  customerId      String?
  vendorId        String?
  supplierId      String?
  orderId         String?
  studioSessionId String?

  assignedToUserId String?
  assignedTeam     CaseTeam?

  suggestedCategoryId String?
  suggestedPriority   CasePriority?

  firstResponseDueAt DateTime?
  resolutionDueAt    DateTime?
  firstRespondedAt   DateTime?
  resolvedAt         DateTime?
  closedAt           DateTime?

  relatedReturnId String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  category CaseCategory  @relation(fields: [categoryId], references: [id])
  messages CaseMessage[]
  events   CaseEvent[]

  @@index([status])
  @@index([assignedToUserId, status])
  @@index([customerId])
  @@index([vendorId])
  @@index([supplierId])
  @@index([channel])
  @@index([categoryId])
  @@index([priority, status])
  @@index([contactPhone])
}

model CaseMessage {
  id           String         @id @default(cuid())
  caseId       String
  authorUserId String?
  authorRole   CaseAuthorRole
  body         String
  isInternal   Boolean        @default(false)
  channel      CaseChannel
  attachments  Json           @default("[]")
  externalRef  String?
  createdAt    DateTime       @default(now())

  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@index([caseId, createdAt])
}

model CaseEvent {
  id          String        @id @default(cuid())
  caseId      String
  actorUserId String?
  type        CaseEventType
  data        Json          @default("{}")
  createdAt   DateTime      @default(now())

  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@index([caseId, createdAt])
}
```

- [ ] **Step 3: Push the schema to BOTH databases and regenerate the client.**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/db
DATABASE_URL="postgresql://postgres:password@localhost:5432/eluna" pnpm exec prisma db push
DATABASE_URL="postgresql://postgres:password@localhost:5432/ayvana_test" pnpm exec prisma db push
pnpm exec prisma generate
```
Expected: both end with `Your database is now in sync with your Prisma schema.` and generate prints `Generated Prisma Client`.

- [ ] **Step 4: Add the test harness.** Create `packages/db/vitest.config.ts` (identical knobs to studio's):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

Create `packages/db/test/setup.ts`:

```ts
import { config } from "dotenv";
import { resolve } from "node:path";

// Reuse the db package's local .env, then force the connection onto
// `ayvana_test` so tests NEVER touch dev data. Set before any module imports
// the Prisma client singleton.
config({ path: resolve(__dirname, "../.env") });

const url = process.env.DATABASE_URL ?? "";
if (url && !/\/ayvana_test(\?|$)/.test(url)) {
  process.env.DATABASE_URL = url.replace(/\/([^/?]+)(\?|$)/, "/ayvana_test$2");
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/ayvana_test";
}
process.env.NODE_ENV = "test";
```

- [ ] **Step 5: Add shared test factories.** Create `packages/db/test/factories.ts`:

```ts
import { randomBytes } from "node:crypto";
import { prisma } from "../src";

export const uid = (p: string) => `${p}_case_${Date.now()}_${randomBytes(4).toString("hex")}`;

/** A category to file cases under. */
export async function makeCategory(overrides: Partial<{ slug: string; defaultPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }> = {}) {
  return prisma.caseCategory.create({
    data: {
      slug: overrides.slug ?? uid("cat"),
      name: "Service",
      defaultPriority: overrides.defaultPriority ?? "MEDIUM",
      sortOrder: 0,
    },
  });
}

/** Minimal CreateCaseInput for a customer website complaint. */
export function caseInput(categoryId: string, over: Record<string, unknown> = {}) {
  return {
    type: "COMPLAINT" as const,
    categoryId,
    channel: "WEBSITE" as const,
    subject: "Order arrived damaged",
    description: "The abaya had a tear.",
    openerUserId: uid("usr"),
    openerRole: "CUSTOMER" as const,
    contact: { name: "Aisha", email: "aisha@example.com", phone: "+971500000000" },
    ...over,
  };
}
```

- [ ] **Step 6: Write the failing smoke test.** Create `packages/db/test/schema.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { makeCategory } from "./factories";

describe("case schema (integration)", () => {
  it("persists a CaseCategory and a Case with the new enums", async () => {
    const cat = await makeCategory({ slug: `svc_${Date.now()}` });
    const c = await prisma.case.create({
      data: {
        caseNumber: `CS-TEST-${Date.now()}`,
        type: "COMPLAINT",
        categoryId: cat.id,
        channel: "WHATSAPP",
        priority: "URGENT",
        subject: "s",
        description: "d",
        openerRole: "SUPPLIER",
        contactName: "x",
      },
    });
    expect(c.status).toBe("NEW");
    expect(c.priority).toBe("URGENT");

    const roundtrip = await prisma.case.findUnique({ where: { id: c.id } });
    expect(roundtrip?.channel).toBe("WHATSAPP");
  });
});
```

- [ ] **Step 7: Add the test script + devDeps** to `packages/db/package.json`. Add `"test": "vitest run"` to `scripts`, and add to `devDependencies`: `"vitest": "^2.1.0"`, `"dotenv": "^16.4.0"`, `"tsx": "^4.7.0"`. Then run `pnpm install` from the repo root.

- [ ] **Step 8: Run the smoke test.**

Run: `pnpm --filter @ayvana/db test`
Expected: `Test Files 1 passed`, `Tests 1 passed`.

- [ ] **Step 9: Commit.**

```bash
git add packages/db/prisma/schema.prisma packages/db/package.json packages/db/vitest.config.ts packages/db/test/setup.ts packages/db/test/factories.ts packages/db/test/schema.int.test.ts
git commit -m "feat(cases): schema — Case/CaseMessage/CaseCategory/CaseEvent + enums + role/agent extensions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Seed default case categories

**Files:**
- Create: `packages/db/src/case-seed.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/case-seed.int.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/case-seed.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { seedCaseCategories, DEFAULT_CASE_CATEGORIES } from "../src/case-seed";

describe("seedCaseCategories (integration)", () => {
  it("is idempotent and upserts all defaults", async () => {
    await seedCaseCategories();
    await seedCaseCategories(); // second run must not duplicate
    for (const def of DEFAULT_CASE_CATEGORIES) {
      const rows = await prisma.caseCategory.findMany({ where: { slug: def.slug } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe(def.name);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test case-seed`
Expected: FAIL — `Cannot find module '../src/case-seed'`.

- [ ] **Step 3: Implement the seed.** Create `packages/db/src/case-seed.ts`:

```ts
import { prisma } from "./client";
import type { CasePriority, CaseTeam } from "@prisma/client";

export const DEFAULT_CASE_CATEGORIES: {
  slug: string;
  name: string;
  description: string;
  defaultPriority: CasePriority;
  defaultTeam: CaseTeam | null;
  sortOrder: number;
}[] = [
  { slug: "service", name: "Service", description: "General service issues", defaultPriority: "MEDIUM", defaultTeam: "CALL_CENTER", sortOrder: 10 },
  { slug: "refund", name: "Refund", description: "Refund requests and disputes", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 20 },
  { slug: "studio", name: "AI Studio", description: "AI Fashion Studio problems", defaultPriority: "MEDIUM", defaultTeam: "SUPPORT", sortOrder: 30 },
  { slug: "delivery", name: "Delivery", description: "Shipping and delivery", defaultPriority: "HIGH", defaultTeam: "CALL_CENTER", sortOrder: 40 },
  { slug: "product-quality", name: "Product Quality", description: "Damaged or defective items", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 50 },
  { slug: "payment", name: "Payment", description: "Payment and billing", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 60 },
  { slug: "suggestion", name: "Suggestion", description: "Feature ideas and feedback", defaultPriority: "LOW", defaultTeam: "CALL_CENTER", sortOrder: 70 },
  { slug: "other", name: "Other", description: "Anything else", defaultPriority: "MEDIUM", defaultTeam: "CALL_CENTER", sortOrder: 80 },
];

/** Idempotently upsert the default case categories (safe to run repeatedly). */
export async function seedCaseCategories(): Promise<void> {
  for (const c of DEFAULT_CASE_CATEGORIES) {
    await prisma.caseCategory.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, description: c.description, defaultPriority: c.defaultPriority, defaultTeam: c.defaultTeam, sortOrder: c.sortOrder },
    });
  }
}
```

- [ ] **Step 4: Export it.** In `packages/db/src/index.ts` add after the existing exports:

```ts
export * from "./case-seed";
```

- [ ] **Step 5: Run the test.**

Run: `pnpm --filter @ayvana/db test case-seed`
Expected: PASS.

- [ ] **Step 6: Seed the dev + test databases.**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/db
DATABASE_URL="postgresql://postgres:password@localhost:5432/eluna" pnpm exec tsx -e "import('./src/case-seed').then(m=>m.seedCaseCategories()).then(()=>process.exit(0))"
```
Expected: exits 0 with no error.

- [ ] **Step 7: Commit.**

```bash
git add packages/db/src/case-seed.ts packages/db/src/index.ts packages/db/test/case-seed.int.test.ts
git commit -m "feat(cases): seed default case categories

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Case state machine + SLA computation

**Files:**
- Create: `packages/db/src/case-status.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/case-status.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/case-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertCaseTransition, CaseTransitionError, caseSlaDueDates } from "../src/case-status";

describe("case state machine", () => {
  it("allows NEW -> ASSIGNED and ASSIGNED -> IN_PROGRESS", () => {
    expect(() => assertCaseTransition("NEW", "ASSIGNED")).not.toThrow();
    expect(() => assertCaseTransition("ASSIGNED", "IN_PROGRESS")).not.toThrow();
  });

  it("allows reopen RESOLVED -> IN_PROGRESS and CLOSED -> IN_PROGRESS", () => {
    expect(() => assertCaseTransition("RESOLVED", "IN_PROGRESS")).not.toThrow();
    expect(() => assertCaseTransition("CLOSED", "IN_PROGRESS")).not.toThrow();
  });

  it("rejects illegal NEW -> CLOSED", () => {
    expect(() => assertCaseTransition("NEW", "CLOSED")).toThrow(CaseTransitionError);
  });

  it("computes SLA due dates from priority (URGENT is tighter than LOW)", () => {
    const base = new Date("2026-10-03T00:00:00.000Z");
    const u = caseSlaDueDates("URGENT", base);
    const l = caseSlaDueDates("LOW", base);
    expect(u.resolutionDueAt.getTime()).toBeLessThan(l.resolutionDueAt.getTime());
    expect(u.firstResponseDueAt.getTime()).toBe(base.getTime() + 1 * 3600_000);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test case-status`
Expected: FAIL — `Cannot find module '../src/case-status'`.

- [ ] **Step 3: Implement.** Create `packages/db/src/case-status.ts`:

```ts
import type { CaseStatus, CasePriority } from "@prisma/client";

export class CaseTransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Illegal case transition: ${from} -> ${to}`);
    this.name = "CaseTransitionError";
  }
}

/** Allowed next-states per status. Reopen = RESOLVED|CLOSED -> IN_PROGRESS. */
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: [],
};

export function canCaseTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

export function assertCaseTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canCaseTransition(from, to)) throw new CaseTransitionError(from, to);
}

/** Target hours per priority: [firstResponse, resolution]. */
export const SLA_HOURS: Record<CasePriority, { first: number; resolution: number }> = {
  URGENT: { first: 1, resolution: 4 },
  HIGH: { first: 4, resolution: 24 },
  MEDIUM: { first: 12, resolution: 72 },
  LOW: { first: 24, resolution: 168 },
};

export function caseSlaDueDates(priority: CasePriority, from: Date = new Date()) {
  const { first, resolution } = SLA_HOURS[priority];
  return {
    firstResponseDueAt: new Date(from.getTime() + first * 3600_000),
    resolutionDueAt: new Date(from.getTime() + resolution * 3600_000),
  };
}
```

- [ ] **Step 4: Export it.** In `packages/db/src/index.ts` add:

```ts
export * from "./case-status";
```

- [ ] **Step 5: Run the test.**

Run: `pnpm --filter @ayvana/db test case-status`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit.**

```bash
git add packages/db/src/case-status.ts packages/db/src/index.ts packages/db/test/case-status.test.ts
git commit -m "feat(cases): case state machine + SLA due-date computation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Domain — `createCase`

**Files:**
- Create: `packages/db/src/cases.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/cases-create.int.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/cases-create.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("createCase (integration)", () => {
  it("creates a NEW case, a CREATED event, and a case.created outbox event", async () => {
    const cat = await makeCategory({ defaultPriority: "HIGH" });
    const res = await createCase(caseInput(cat.id));

    const c = await prisma.case.findUnique({ where: { id: res.id } });
    expect(c?.status).toBe("NEW");
    expect(c?.priority).toBe("HIGH"); // inherited from category default
    expect(c?.caseNumber).toMatch(/^CS-\d{4}-\d{5}$/);
    expect(c?.resolutionDueAt).toBeInstanceOf(Date);

    const events = await prisma.caseEvent.findMany({ where: { caseId: res.id } });
    expect(events.map((e) => e.type)).toContain("CREATED");

    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: "case.created", payload: { path: ["caseId"], equals: res.id } },
    });
    expect(outbox).not.toBeNull();
  });

  it("honors an explicit priority override", async () => {
    const cat = await makeCategory({ defaultPriority: "LOW" });
    const res = await createCase(caseInput(cat.id, { priority: "URGENT" }));
    const c = await prisma.case.findUnique({ where: { id: res.id } });
    expect(c?.priority).toBe("URGENT");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test cases-create`
Expected: FAIL — `Cannot find module '../src/cases'`.

- [ ] **Step 3: Implement `createCase` (plus shared types).** Create `packages/db/src/cases.ts`:

```ts
import type { Prisma, CaseType, CaseChannel, CaseOpenerRole, CasePriority } from "@prisma/client";
import { prisma } from "./client";
import { appendOutboxEvent } from "./outbox";
import { caseSlaDueDates } from "./case-status";

type Tx = Prisma.TransactionClient;

export type CaseContact = { name: string; email?: string | null; phone?: string | null };
export type CaseLinks = {
  customerId?: string | null;
  vendorId?: string | null;
  supplierId?: string | null;
  orderId?: string | null;
  studioSessionId?: string | null;
};

export type CreateCaseInput = {
  type: CaseType;
  categoryId: string;
  channel: CaseChannel;
  subject: string;
  description: string;
  openerUserId?: string | null;
  openerRole: CaseOpenerRole;
  contact: CaseContact;
  priority?: CasePriority;
  links?: CaseLinks;
};

/** Human-friendly `CS-YYYY-NNNNN` number, scoped to the calendar year. */
async function nextCaseNumber(tx: Tx, year: number): Promise<string> {
  const count = await tx.case.count({ where: { caseNumber: { startsWith: `CS-${year}-` } } });
  return `CS-${year}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Create a case. Priority falls back to the category default. SLA due dates are
 * derived from the effective priority. The Case, a CREATED CaseEvent, and a
 * `case.created` outbox event are written in ONE transaction (so a committed
 * case always has its event; a rolled-back one leaves nothing behind).
 */
export async function createCase(input: CreateCaseInput): Promise<{ id: string; caseNumber: string }> {
  const category = await prisma.caseCategory.findUniqueOrThrow({ where: { id: input.categoryId } });
  const priority = input.priority ?? category.defaultPriority;
  const now = new Date();
  const sla = caseSlaDueDates(priority, now);

  return prisma.$transaction(async (tx) => {
    const caseNumber = await nextCaseNumber(tx, now.getFullYear());
    const created = await tx.case.create({
      data: {
        caseNumber,
        type: input.type,
        categoryId: input.categoryId,
        channel: input.channel,
        priority,
        subject: input.subject,
        description: input.description,
        openerUserId: input.openerUserId ?? null,
        openerRole: input.openerRole,
        contactName: input.contact.name,
        contactEmail: input.contact.email ?? null,
        contactPhone: input.contact.phone ?? null,
        customerId: input.links?.customerId ?? null,
        vendorId: input.links?.vendorId ?? null,
        supplierId: input.links?.supplierId ?? null,
        orderId: input.links?.orderId ?? null,
        studioSessionId: input.links?.studioSessionId ?? null,
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      },
      select: { id: true, caseNumber: true },
    });

    await tx.caseEvent.create({
      data: { caseId: created.id, actorUserId: input.openerUserId ?? null, type: "CREATED", data: { channel: input.channel } },
    });
    await appendOutboxEvent(tx, { type: "case.created", payload: { caseId: created.id } });

    return created;
  });
}
```

- [ ] **Step 4: Export it.** In `packages/db/src/index.ts` add:

```ts
export * from "./cases";
```

- [ ] **Step 5: Run the test.**

Run: `pnpm --filter @ayvana/db test cases-create`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit.**

```bash
git add packages/db/src/cases.ts packages/db/src/index.ts packages/db/test/cases-create.int.test.ts
git commit -m "feat(cases): createCase domain helper (event + outbox, transactional)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Domain — `addCaseMessage` (first-response tracking)

**Files:**
- Modify: `packages/db/src/cases.ts`
- Test: `packages/db/test/cases-message.int.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/cases-message.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, addCaseMessage } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("addCaseMessage (integration)", () => {
  it("appends a message, a MESSAGE event, and a case.message_added outbox event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    const res = await addCaseMessage({ caseId: id, authorRole: "CUSTOMER", body: "any update?", channel: "WEBSITE" });

    const msg = await prisma.caseMessage.findUnique({ where: { id: res.id } });
    expect(msg?.body).toBe("any update?");
    const outbox = await prisma.outboxEvent.findFirst({
      where: { type: "case.message_added", payload: { path: ["messageId"], equals: res.id } },
    });
    expect(outbox).not.toBeNull();
  });

  it("stamps firstRespondedAt on the first HANDLER reply only", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));

    await addCaseMessage({ caseId: id, authorRole: "CUSTOMER", body: "hello", channel: "WEBSITE" });
    let c = await prisma.case.findUnique({ where: { id } });
    expect(c?.firstRespondedAt).toBeNull(); // customer message is not a response

    await addCaseMessage({ caseId: id, authorRole: "SUPPORT", authorUserId: "agent1", body: "on it", channel: "WEBSITE" });
    c = await prisma.case.findUnique({ where: { id } });
    const firstAt = c?.firstRespondedAt;
    expect(firstAt).toBeInstanceOf(Date);

    await addCaseMessage({ caseId: id, authorRole: "SUPPORT", authorUserId: "agent1", body: "again", channel: "WEBSITE" });
    c = await prisma.case.findUnique({ where: { id } });
    expect(c?.firstRespondedAt?.getTime()).toBe(firstAt?.getTime()); // unchanged
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test cases-message`
Expected: FAIL — `addCaseMessage is not a function` / not exported.

- [ ] **Step 3: Implement.** Append to `packages/db/src/cases.ts`:

```ts
import type { CaseAuthorRole } from "@prisma/client";

const HANDLER_ROLES: CaseAuthorRole[] = ["SUPPORT", "CALL_CENTER", "ADMIN"];

export type AddCaseMessageInput = {
  caseId: string;
  authorUserId?: string | null;
  authorRole: CaseAuthorRole;
  body: string;
  channel: CaseChannel;
  isInternal?: boolean;
  attachments?: Prisma.InputJsonValue;
  externalRef?: string | null;
};

/**
 * Append a message to a case. The first non-internal HANDLER reply stamps
 * `firstRespondedAt` (SLA metric). Message + MESSAGE event + outbox are atomic.
 */
export async function addCaseMessage(input: AddCaseMessageInput): Promise<{ id: string }> {
  const isHandlerResponse = !input.isInternal && HANDLER_ROLES.includes(input.authorRole);

  return prisma.$transaction(async (tx) => {
    const msg = await tx.caseMessage.create({
      data: {
        caseId: input.caseId,
        authorUserId: input.authorUserId ?? null,
        authorRole: input.authorRole,
        body: input.body,
        channel: input.channel,
        isInternal: input.isInternal ?? false,
        attachments: input.attachments ?? [],
        externalRef: input.externalRef ?? null,
      },
      select: { id: true },
    });

    if (isHandlerResponse) {
      await tx.case.updateMany({
        where: { id: input.caseId, firstRespondedAt: null },
        data: { firstRespondedAt: new Date() },
      });
    }

    await tx.caseEvent.create({
      data: { caseId: input.caseId, actorUserId: input.authorUserId ?? null, type: "MESSAGE", data: { messageId: msg.id, isInternal: input.isInternal ?? false } },
    });
    await appendOutboxEvent(tx, { type: "case.message_added", payload: { caseId: input.caseId, messageId: msg.id } });

    return msg;
  });
}
```

- [ ] **Step 4: Run the test.**

Run: `pnpm --filter @ayvana/db test cases-message`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/db/src/cases.ts packages/db/test/cases-message.int.test.ts
git commit -m "feat(cases): addCaseMessage with first-response SLA stamping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Domain — `assignCase` + `transitionCase`

**Files:**
- Modify: `packages/db/src/cases.ts`
- Test: `packages/db/test/cases-transition.int.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/cases-transition.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, assignCase, transitionCase } from "../src/cases";
import { CaseTransitionError } from "../src/case-status";
import { makeCategory, caseInput } from "./factories";

describe("assignCase + transitionCase (integration)", () => {
  it("assignCase moves NEW -> ASSIGNED, sets assignee + team + ASSIGNED event + outbox", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await assignCase({ caseId: id, assignedToUserId: "agent1", assignedTeam: "SUPPORT", actorUserId: "admin1" });

    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("ASSIGNED");
    expect(c?.assignedToUserId).toBe("agent1");
    expect(c?.assignedTeam).toBe("SUPPORT");
    const outbox = await prisma.outboxEvent.findFirst({ where: { type: "case.assigned", payload: { path: ["caseId"], equals: id } } });
    expect(outbox).not.toBeNull();
  });

  it("transitionCase rejects illegal transitions", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await expect(transitionCase({ caseId: id, to: "CLOSED", actorUserId: "admin1" })).rejects.toBeInstanceOf(CaseTransitionError);
  });

  it("transitionCase applies a legal transition + STATUS_CHANGED event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "admin1" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("IN_PROGRESS");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test cases-transition`
Expected: FAIL — `assignCase is not a function`.

- [ ] **Step 3: Implement.** Append to `packages/db/src/cases.ts`:

```ts
import type { CaseStatus, CaseTeam } from "@prisma/client";
import { assertCaseTransition } from "./case-status";

export async function assignCase(params: {
  caseId: string;
  assignedToUserId: string;
  assignedTeam?: CaseTeam | null;
  actorUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    const nextStatus: CaseStatus = current.status === "NEW" ? "ASSIGNED" : current.status;
    await tx.case.update({
      where: { id: params.caseId },
      data: { assignedToUserId: params.assignedToUserId, assignedTeam: params.assignedTeam ?? null, status: nextStatus },
    });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "ASSIGNED", data: { assignedToUserId: params.assignedToUserId, assignedTeam: params.assignedTeam ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.assigned", payload: { caseId: params.caseId, assignedToUserId: params.assignedToUserId } });
  });
}

/** Apply a validated status change. Throws CaseTransitionError on illegal moves. */
export async function transitionCase(params: {
  caseId: string;
  to: CaseStatus;
  actorUserId: string;
  reason?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, params.to);
    await tx.case.update({ where: { id: params.caseId }, data: { status: params.to } });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "STATUS_CHANGED", data: { from: current.status, to: params.to, reason: params.reason ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.status_changed", payload: { caseId: params.caseId, from: current.status, to: params.to } });
  });
}
```

- [ ] **Step 4: Run the test.**

Run: `pnpm --filter @ayvana/db test cases-transition`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/db/src/cases.ts packages/db/test/cases-transition.int.test.ts
git commit -m "feat(cases): assignCase + transitionCase (state-machine-validated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Domain — `resolveCase`, `reopenCase`, `applyCaseTriage`, read helpers

**Files:**
- Modify: `packages/db/src/cases.ts`
- Test: `packages/db/test/cases-resolve.int.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/db/test/cases-resolve.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { createCase, transitionCase, resolveCase, reopenCase, applyCaseTriage, getCaseDetail, listCases } from "../src/cases";
import { makeCategory, caseInput } from "./factories";

describe("resolve/reopen/triage/read (integration)", () => {
  it("resolveCase sets RESOLVED + resolvedAt + relatedReturnId + outbox", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "a" });
    await resolveCase({ caseId: id, actorUserId: "a", relatedReturnId: "ret_1", resolutionNote: "refunded" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("RESOLVED");
    expect(c?.resolvedAt).toBeInstanceOf(Date);
    expect(c?.relatedReturnId).toBe("ret_1");
    const outbox = await prisma.outboxEvent.findFirst({ where: { type: "case.resolved", payload: { path: ["caseId"], equals: id } } });
    expect(outbox).not.toBeNull();
  });

  it("reopenCase goes RESOLVED -> IN_PROGRESS with a REOPENED event", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await transitionCase({ caseId: id, to: "IN_PROGRESS", actorUserId: "a" });
    await resolveCase({ caseId: id, actorUserId: "a" });
    await reopenCase({ caseId: id, actorUserId: "a" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.status).toBe("IN_PROGRESS");
    const ev = await prisma.caseEvent.findFirst({ where: { caseId: id, type: "REOPENED" } });
    expect(ev).not.toBeNull();
  });

  it("applyCaseTriage stores suggestions without changing status", async () => {
    const cat = await makeCategory();
    const cat2 = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    await applyCaseTriage(id, { suggestedCategoryId: cat2.id, suggestedPriority: "URGENT" });
    const c = await prisma.case.findUnique({ where: { id } });
    expect(c?.suggestedCategoryId).toBe(cat2.id);
    expect(c?.suggestedPriority).toBe("URGENT");
    expect(c?.status).toBe("NEW");
  });

  it("read helpers: getCaseDetail includes messages+events; listCases filters by status", async () => {
    const cat = await makeCategory();
    const { id } = await createCase(caseInput(cat.id));
    const detail = await getCaseDetail(id);
    expect(detail?.messages).toBeDefined();
    expect(detail?.events.length).toBeGreaterThan(0);
    const open = await listCases({ status: "NEW" });
    expect(open.some((c) => c.id === id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm --filter @ayvana/db test cases-resolve`
Expected: FAIL — `resolveCase is not a function`.

- [ ] **Step 3: Implement.** Append to `packages/db/src/cases.ts`:

```ts
export async function resolveCase(params: {
  caseId: string;
  actorUserId: string;
  relatedReturnId?: string | null;
  resolutionNote?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, "RESOLVED");
    await tx.case.update({
      where: { id: params.caseId },
      data: { status: "RESOLVED", resolvedAt: new Date(), relatedReturnId: params.relatedReturnId ?? undefined },
    });
    await tx.caseEvent.create({
      data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "RESOLVED", data: { relatedReturnId: params.relatedReturnId ?? null, note: params.resolutionNote ?? null } },
    });
    await appendOutboxEvent(tx, { type: "case.resolved", payload: { caseId: params.caseId } });
  });
}

export async function reopenCase(params: { caseId: string; actorUserId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: params.caseId }, select: { status: true } });
    assertCaseTransition(current.status, "IN_PROGRESS");
    await tx.case.update({ where: { id: params.caseId }, data: { status: "IN_PROGRESS", resolvedAt: null, closedAt: null } });
    await tx.caseEvent.create({ data: { caseId: params.caseId, actorUserId: params.actorUserId, type: "REOPENED", data: { from: current.status } } });
    await appendOutboxEvent(tx, { type: "case.status_changed", payload: { caseId: params.caseId, from: current.status, to: "IN_PROGRESS" } });
  });
}

/** Store AI triage SUGGESTIONS (never auto-applies — a human confirms). */
export async function applyCaseTriage(
  caseId: string,
  s: { suggestedCategoryId?: string | null; suggestedPriority?: CasePriority | null },
): Promise<void> {
  await prisma.case.update({
    where: { id: caseId },
    data: { suggestedCategoryId: s.suggestedCategoryId ?? undefined, suggestedPriority: s.suggestedPriority ?? undefined },
  });
}

export type ListCasesFilter = {
  status?: CaseStatus;
  categoryId?: string;
  channel?: CaseChannel;
  assignedToUserId?: string;
  openerUserId?: string;
};

export function listCases(filter: ListCasesFilter = {}) {
  return prisma.case.findMany({
    where: {
      status: filter.status,
      categoryId: filter.categoryId,
      channel: filter.channel,
      assignedToUserId: filter.assignedToUserId,
      openerUserId: filter.openerUserId,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { category: { select: { name: true, slug: true } } },
    take: 200,
  });
}

export function getCaseDetail(caseId: string) {
  return prisma.case.findUnique({
    where: { id: caseId },
    include: {
      category: true,
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}
```

- [ ] **Step 4: Run the test.**

Run: `pnpm --filter @ayvana/db test cases-resolve`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full db suite to confirm no regressions.**

Run: `pnpm --filter @ayvana/db test`
Expected: all case test files pass.

- [ ] **Step 6: Commit.**

```bash
git add packages/db/src/cases.ts packages/db/test/cases-resolve.int.test.ts
git commit -m "feat(cases): resolve/reopen/triage + read helpers (listCases/getCaseDetail)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `@ayvana/messaging` gated WhatsApp gateway

**Files:**
- Create: `packages/messaging/package.json`, `packages/messaging/tsconfig.json`, `packages/messaging/vitest.config.ts`
- Create: `packages/messaging/src/{gateway,config,simulated,whatsapp,factory,index}.ts`
- Test: `packages/messaging/test/messaging.test.ts`

- [ ] **Step 1: Scaffold the package.** Create `packages/messaging/package.json`:

```json
{
  "name": "@ayvana/messaging",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "@ayvana/config": "workspace:*",
    "@types/node": "^20",
    "typescript": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/messaging/tsconfig.json`:

```json
{
  "extends": "@ayvana/config/tsconfig/base",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `packages/messaging/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { testTimeout: 10_000 } });
```

- [ ] **Step 2: Write the failing test.** Create `packages/messaging/test/messaging.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getMessagingGateway, SimulatedMessaging } from "../src";

describe("messaging gateway (keyless)", () => {
  it("factory returns SimulatedMessaging when WhatsApp is not configured", () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_API_TOKEN;
    expect(getMessagingGateway()).toBeInstanceOf(SimulatedMessaging);
  });

  it("SimulatedMessaging.sendMessage returns a synthetic ref and never throws", async () => {
    const res = await new SimulatedMessaging().sendMessage({ phone: "+971500000000", text: "hi" });
    expect(res.sent).toBe(true);
    if (res.sent) expect(res.externalRef).toMatch(/^sim_/);
  });

  it("parseWebhook extracts an inbound message from the simulated payload", () => {
    const body = JSON.stringify({ from: "+971500000000", text: "help", id: "wamid.1" });
    const parsed = new SimulatedMessaging().parseWebhook(body);
    expect(parsed).toEqual({ kind: "message", from: "+971500000000", text: "help", externalRef: "wamid.1" });
  });
});
```

- [ ] **Step 3: Run to verify it fails.**

Run: `pnpm install && pnpm --filter @ayvana/messaging test`
Expected: FAIL — `Cannot find module '../src'`.

- [ ] **Step 4: Implement the gateway interface.** Create `packages/messaging/src/gateway.ts`:

```ts
export type SendMessageParams = { phone: string; text: string; templateId?: string };

export type SendMessageResult = { sent: true; externalRef?: string } | { sent: false; error: string };

export type InboundMessage =
  | { kind: "message"; from: string; text: string; externalRef?: string }
  | { kind: "ignored" };

export interface MessagingGateway {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  parseWebhook(rawBody: string, headers?: Headers): InboundMessage;
}
```

- [ ] **Step 5: Implement config + simulated + whatsapp + factory + index.**

`packages/messaging/src/config.ts`:

```ts
export const hasWhatsapp = () => !!process.env.WHATSAPP_PHONE_NUMBER_ID && !!process.env.WHATSAPP_API_TOKEN;
```

`packages/messaging/src/simulated.ts`:

```ts
import type { MessagingGateway, SendMessageParams, SendMessageResult, InboundMessage } from "./gateway";

/** Keyless fallback: logs the outbound payload, parses a plain `{from,text,id}` webhook. */
export class SimulatedMessaging implements MessagingGateway {
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    console.info("[messaging:simulated] →", params.phone, JSON.stringify(params.text).slice(0, 120));
    return { sent: true, externalRef: `sim_${Date.now()}` };
  }

  parseWebhook(rawBody: string): InboundMessage {
    try {
      const b = JSON.parse(rawBody) as { from?: unknown; text?: unknown; id?: unknown };
      if (typeof b.from === "string" && typeof b.text === "string") {
        return { kind: "message", from: b.from, text: b.text, externalRef: typeof b.id === "string" ? b.id : undefined };
      }
    } catch {
      /* fall through */
    }
    return { kind: "ignored" };
  }
}
```

`packages/messaging/src/whatsapp.ts`:

```ts
import type { MessagingGateway, SendMessageParams, SendMessageResult, InboundMessage } from "./gateway";

/**
 * Meta WhatsApp Cloud API adapter. Active only when WHATSAPP_PHONE_NUMBER_ID +
 * WHATSAPP_API_TOKEN are set (see config.hasWhatsapp). Scaffolded; the live POST
 * is exercised once real credentials exist.
 */
export class WhatsappGateway implements MessagingGateway {
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const token = process.env.WHATSAPP_API_TOKEN!;
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: params.phone, type: "text", text: { body: params.text } }),
      });
      if (!res.ok) return { sent: false, error: `whatsapp ${res.status}` };
      const json = (await res.json()) as { messages?: { id?: string }[] };
      return { sent: true, externalRef: json.messages?.[0]?.id };
    } catch (err) {
      return { sent: false, error: err instanceof Error ? err.message : "send failed" };
    }
  }

  parseWebhook(rawBody: string): InboundMessage {
    try {
      const b = JSON.parse(rawBody) as any;
      const msg = b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg?.from && msg?.text?.body) {
        return { kind: "message", from: `+${msg.from}`, text: msg.text.body, externalRef: msg.id };
      }
    } catch {
      /* fall through */
    }
    return { kind: "ignored" };
  }
}
```

`packages/messaging/src/factory.ts`:

```ts
import type { MessagingGateway } from "./gateway";
import { SimulatedMessaging } from "./simulated";
import { WhatsappGateway } from "./whatsapp";
import { hasWhatsapp } from "./config";

/** Never throws. Unconfigured → SimulatedMessaging (logs, no network). */
export function getMessagingGateway(): MessagingGateway {
  return hasWhatsapp() ? new WhatsappGateway() : new SimulatedMessaging();
}
```

`packages/messaging/src/index.ts`:

```ts
export type { MessagingGateway, SendMessageParams, SendMessageResult, InboundMessage } from "./gateway";
export { getMessagingGateway } from "./factory";
export { SimulatedMessaging } from "./simulated";
export { WhatsappGateway } from "./whatsapp";
export { hasWhatsapp } from "./config";
```

- [ ] **Step 6: Run the test.**

Run: `pnpm --filter @ayvana/messaging test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit.**

```bash
git add packages/messaging
git commit -m "feat(messaging): @ayvana/messaging gated WhatsApp gateway + simulated fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Auth — add SUPPORT + CALL_CENTER roles

**Files:**
- Modify: `packages/auth/src/roles.ts`
- Test: `packages/auth/test/roles.test.ts` (create if no test dir — else add to existing)

- [ ] **Step 1: Read `packages/auth/src/roles.ts`** to see the exact `UserRole` union + `ROLES` const shape.

- [ ] **Step 2: Add the two roles.** In `packages/auth/src/roles.ts`, extend the union type and the `ROLES` const:

```ts
export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN" | "SUPPLIER" | "SUPPORT" | "CALL_CENTER";

export const ROLES = {
  CUSTOMER: "CUSTOMER",
  VENDOR: "VENDOR",
  ADMIN: "ADMIN",
  SUPPLIER: "SUPPLIER",
  SUPPORT: "SUPPORT",
  CALL_CENTER: "CALL_CENTER",
} as const satisfies Record<UserRole, UserRole>;

/** Roles permitted to operate the Case Manager console. */
export const CASE_HANDLER_ROLES: UserRole[] = ["ADMIN", "SUPPORT", "CALL_CENTER"];
export const isCaseHandler = (role: UserRole | null | undefined): boolean =>
  !!role && CASE_HANDLER_ROLES.includes(role);
```

- [ ] **Step 3: Export `CASE_HANDLER_ROLES`/`isCaseHandler`** from the auth package entrypoint (`packages/auth/src/index.ts`) if roles are re-exported there — match the existing export style for `ROLES`.

- [ ] **Step 4: Verify with typecheck (no runtime test infra in auth).**

Run: `pnpm --filter @ayvana/auth exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit.**

```bash
git add packages/auth/src/roles.ts packages/auth/src/index.ts
git commit -m "feat(auth): add SUPPORT + CALL_CENTER roles + isCaseHandler helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Shared UI — CaseStatusBadge, CaseSubmitForm, CaseThread

**Files:**
- Create: `packages/ui/src/components/CaseStatusBadge.tsx`, `packages/ui/src/components/CaseSubmitForm.tsx`, `packages/ui/src/components/CaseThread.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Read `packages/ui/src/index.ts`** + one existing component (e.g. `StatusBadge.tsx`) to match export + styling conventions (ink/sand/sage palette, 4px radii, body-xs text).

- [ ] **Step 2: Create `CaseStatusBadge.tsx`:**

```tsx
const TONE: Record<string, string> = {
  NEW: "bg-sand text-mist",
  ASSIGNED: "bg-gold/20 text-gold",
  IN_PROGRESS: "bg-gold/20 text-gold",
  WAITING_CUSTOMER: "bg-sand text-mist",
  RESOLVED: "bg-sage/20 text-sage",
  CLOSED: "bg-sage/20 text-sage",
  CANCELLED: "bg-coral/20 text-coral",
};

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-body-xs font-medium ${TONE[status] ?? "bg-sand text-mist"}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
```

- [ ] **Step 3: Create `CaseSubmitForm.tsx`** (client; posts to a passed server action):

```tsx
"use client";

import { useState } from "react";

export type CaseCategoryOption = { id: string; name: string };
export type CaseSubmitResult = { ok: true; caseNumber: string } | { ok: false; error: string };

type Props = {
  categories: CaseCategoryOption[];
  defaultContactName?: string;
  defaultContactEmail?: string;
  action: (data: {
    type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
    categoryId: string;
    subject: string;
    description: string;
    contactName: string;
    contactEmail: string;
    orderId?: string;
  }) => Promise<CaseSubmitResult>;
  orderId?: string;
};

export function CaseSubmitForm({ categories, action, defaultContactName = "", defaultContactEmail = "", orderId }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await action({
      type: fd.get("type") as "COMPLAINT" | "SUGGESTION" | "QUESTION",
      categoryId: String(fd.get("categoryId")),
      subject: String(fd.get("subject")),
      description: String(fd.get("description")),
      contactName: String(fd.get("contactName")),
      contactEmail: String(fd.get("contactEmail")),
      orderId,
    });
    setBusy(false);
    if (res.ok) setDone(res.caseNumber);
    else setError(res.error);
  }

  if (done) return <p className="rounded-md bg-sage/10 p-4 text-body-sm text-ink">Submitted — your reference is <b>{done}</b>.</p>;

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3">
      <select name="type" className="rounded-md border border-sand bg-white p-2 text-body-sm" defaultValue="COMPLAINT">
        <option value="COMPLAINT">Complaint</option>
        <option value="SUGGESTION">Suggestion</option>
        <option value="QUESTION">Question</option>
      </select>
      <select name="categoryId" className="rounded-md border border-sand bg-white p-2 text-body-sm" required>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input name="subject" placeholder="Subject" required className="rounded-md border border-sand bg-white p-2 text-body-sm" />
      <textarea name="description" placeholder="Describe the issue" required rows={5} className="rounded-md border border-sand bg-white p-2 text-body-sm" />
      <input name="contactName" placeholder="Your name" required defaultValue={defaultContactName} className="rounded-md border border-sand bg-white p-2 text-body-sm" />
      <input name="contactEmail" type="email" placeholder="Email" defaultValue={defaultContactEmail} className="rounded-md border border-sand bg-white p-2 text-body-sm" />
      {error && <p className="text-body-xs text-coral">{error}</p>}
      <button disabled={busy} className="rounded-md bg-ink px-4 py-2 text-body-sm text-ivory disabled:opacity-50">
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create `CaseThread.tsx`** (read-only message list, hides internal notes by default):

```tsx
export type CaseThreadMessage = { id: string; authorRole: string; body: string; isInternal: boolean; createdAt: string | Date };

export function CaseThread({ messages, showInternal = false }: { messages: CaseThreadMessage[]; showInternal?: boolean }) {
  const visible = messages.filter((m) => showInternal || !m.isInternal);
  return (
    <div className="flex flex-col gap-3">
      {visible.map((m) => (
        <div key={m.id} className={`rounded-md border p-3 ${m.isInternal ? "border-gold/40 bg-gold/5" : "border-sand bg-white"}`}>
          <div className="mb-1 flex items-center gap-2 text-body-xs text-mist">
            <span className="font-medium text-ink">{m.authorRole.toLowerCase()}</span>
            {m.isInternal && <span className="text-gold">internal</span>}
            <span>{new Date(m.createdAt).toLocaleString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-body-sm text-ink">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Export all three** from `packages/ui/src/index.ts` (append, matching existing export lines):

```ts
export { CaseStatusBadge } from "./components/CaseStatusBadge";
export { CaseSubmitForm } from "./components/CaseSubmitForm";
export type { CaseCategoryOption, CaseSubmitResult } from "./components/CaseSubmitForm";
export { CaseThread } from "./components/CaseThread";
export type { CaseThreadMessage } from "./components/CaseThread";
```

- [ ] **Step 6: Typecheck.**

Run: `pnpm --filter @ayvana/ui exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add packages/ui/src/components/CaseStatusBadge.tsx packages/ui/src/components/CaseSubmitForm.tsx packages/ui/src/components/CaseThread.tsx packages/ui/src/index.ts
git commit -m "feat(ui): shared Case components (badge, submit form, thread)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Admin console — Cases queue list + Sidebar entry

**Files:**
- Modify: `apps/admin/app/(dashboard)/components/Sidebar.tsx`
- Create: `apps/admin/app/(dashboard)/cases/page.tsx`

- [ ] **Step 1: Add the Sidebar nav entry.** In `apps/admin/app/(dashboard)/components/Sidebar.tsx`, add to `NAV_ITEMS` after the AI Studio entry:

```tsx
  { icon: "inbox", label: "Cases", href: "/cases" },
```

And extend the `isActive` chain so `/cases` is active on nested routes (mirror the existing `/ai-studio` branch):

```tsx
                          : href === "/cases"
                          ? pathname === "/cases" || pathname.startsWith("/cases/")
```

- [ ] **Step 2: Build the queue list.** Create `apps/admin/app/(dashboard)/cases/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, listCases, type CaseStatus } from "@ayvana/db";
import { CaseStatusBadge } from "@ayvana/ui";
import { getAuthUser } from "@ayvana/auth";
import { StatusFilter } from "../components/StatusFilter";

export const dynamic = "force-dynamic";

const STATUSES: CaseStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "CANCELLED"];
const FILTERS = [{ label: "All", value: "all" }, ...STATUSES.map((s) => ({ label: s.replace(/_/g, " "), value: s }))];

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getAuthUser();
  if (!user || !["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const status = STATUSES.includes(raw as CaseStatus) ? (raw as CaseStatus) : undefined;
  const cases = await listCases({ status }).catch(() => []);
  void prisma; // listCases encapsulates the query

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="text-display-sm text-ink">Cases</h2>
      <StatusFilter status={raw} options={FILTERS} />
      <div className="flex flex-col gap-2">
        {cases.length === 0 && <p className="text-body-sm text-mist">No cases.</p>}
        {cases.map((c) => (
          <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 hover:border-ink">
            <div className="flex-1">
              <p className="text-body-sm font-medium text-ink">{c.subject}</p>
              <p className="text-body-xs text-mist">{c.caseNumber} · {c.category.name} · {c.channel.toLowerCase()} · {c.priority.toLowerCase()}</p>
            </div>
            <CaseStatusBadge status={c.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles + serves (keyless).**

Run (admin dev server must be running on :3002):
```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @ayvana/admin exec tsc --noEmit
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/cases
```
Expected: tsc clean; HTTP `200`.

- [ ] **Step 4: Commit.**

```bash
git add "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/cases/page.tsx"
git commit -m "feat(admin): cases queue list + sidebar entry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Admin console — case detail, thread, and handler actions

**Files:**
- Create: `apps/admin/app/actions/cases.ts`
- Create: `apps/admin/app/(dashboard)/cases/components/CaseActions.tsx`, `apps/admin/app/(dashboard)/cases/components/CaseComposer.tsx`
- Create: `apps/admin/app/(dashboard)/cases/[id]/page.tsx`

- [ ] **Step 1: Write the server actions.** Create `apps/admin/app/actions/cases.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@ayvana/auth";
import {
  addCaseMessage,
  assignCase,
  transitionCase,
  resolveCase,
  reopenCase,
  type CaseStatus,
  type CaseAuthorRole,
} from "@ayvana/db";

type Result = { success: true } | { error: string };

async function requireHandler() {
  const user = await getAuthUser();
  if (!user) return { user: null, err: "Unauthorized" as const };
  if (!["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) return { user: null, err: "Forbidden" as const };
  return { user, err: null };
}

export async function replyToCaseAction(caseId: string, body: string, isInternal: boolean): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  if (!body.trim()) return { error: "Message is empty" };
  await addCaseMessage({
    caseId,
    authorUserId: user.userId,
    authorRole: (user.role as CaseAuthorRole) ?? "SUPPORT",
    body: body.trim(),
    channel: "WEBSITE",
    isInternal,
  });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function assignToMeAction(caseId: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  const team = user.role === "CALL_CENTER" ? "CALL_CENTER" : "SUPPORT";
  await assignCase({ caseId, assignedToUserId: user.userId, assignedTeam: team, actorUserId: user.userId });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function setCaseStatusAction(caseId: string, to: CaseStatus): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  try {
    await transitionCase({ caseId, to, actorUserId: user.userId });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid transition" };
  }
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function resolveCaseAction(caseId: string, relatedReturnId?: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  try {
    await resolveCase({ caseId, actorUserId: user.userId, relatedReturnId: relatedReturnId || null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cannot resolve" };
  }
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function reopenCaseAction(caseId: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  await reopenCase({ caseId, actorUserId: user.userId });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}
```

- [ ] **Step 2: Build the composer island.** Create `apps/admin/app/(dashboard)/cases/components/CaseComposer.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { replyToCaseAction } from "../../../actions/cases";

export function CaseComposer({ caseId }: { caseId: string }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-sand bg-white p-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write a reply…" className="rounded-md border border-sand p-2 text-body-sm" />
      <label className="flex items-center gap-2 text-body-xs text-mist">
        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (hidden from the opener)
      </label>
      {error && <p className="text-body-xs text-coral">{error}</p>}
      <button
        disabled={pending}
        onClick={() => start(async () => { const r = await replyToCaseAction(caseId, body, internal); if ("error" in r) setError(r.error); else { setBody(""); setError(null); } })}
        className="self-start rounded-md bg-ink px-4 py-1.5 text-body-xs text-ivory disabled:opacity-50"
      >
        {pending ? "Sending…" : internal ? "Add note" : "Reply"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build the actions island.** Create `apps/admin/app/(dashboard)/cases/components/CaseActions.tsx`:

```tsx
"use client";

import { useTransition, useState } from "react";
import { assignToMeAction, setCaseStatusAction, resolveCaseAction, reopenCaseAction } from "../../../actions/cases";

const NEXT: Record<string, string[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELLED"],
  RESOLVED: [],
  CLOSED: [],
  CANCELLED: [],
};

export function CaseActions({ caseId, status }: { caseId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ success: true } | { error: string }>) =>
    start(async () => { const r = await fn(); setError("error" in r ? r.error : null); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => run(() => assignToMeAction(caseId))} className="rounded-md border border-sand px-3 py-1 text-body-xs">Assign to me</button>
      {(NEXT[status] ?? []).map((to) => (
        <button key={to} disabled={pending} onClick={() => run(() => setCaseStatusAction(caseId, to as never))} className="rounded-md border border-sand px-3 py-1 text-body-xs">{to.replace(/_/g, " ").toLowerCase()}</button>
      ))}
      {["IN_PROGRESS", "WAITING_CUSTOMER"].includes(status) && (
        <button disabled={pending} onClick={() => run(() => resolveCaseAction(caseId))} className="rounded-md bg-sage/20 px-3 py-1 text-body-xs text-sage">Resolve</button>
      )}
      {["RESOLVED", "CLOSED"].includes(status) && (
        <button disabled={pending} onClick={() => run(() => reopenCaseAction(caseId))} className="rounded-md border border-sand px-3 py-1 text-body-xs">Reopen</button>
      )}
      {error && <span className="text-body-xs text-coral">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Build the detail page.** Create `apps/admin/app/(dashboard)/cases/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCaseDetail } from "@ayvana/db";
import { CaseStatusBadge, CaseThread, type CaseThreadMessage } from "@ayvana/ui";
import { getAuthUser } from "@ayvana/auth";
import { CaseActions } from "../components/CaseActions";
import { CaseComposer } from "../components/CaseComposer";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) redirect("/");

  const { id } = await params;
  const c = await getCaseDetail(id).catch(() => null);
  if (!c) redirect("/cases");

  const messages: CaseThreadMessage[] = c.messages.map((m) => ({ id: m.id, authorRole: m.authorRole, body: m.body, isInternal: m.isInternal, createdAt: m.createdAt }));
  const overdue = c.resolutionDueAt && !c.resolvedAt && c.resolutionDueAt.getTime() < Date.now();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-display-sm text-ink">{c.subject}</h2>
        <CaseStatusBadge status={c.status} />
        {overdue && <span className="rounded-md bg-coral/20 px-2 py-0.5 text-body-xs text-coral">overdue</span>}
      </div>
      <div className="rounded-md border border-sand bg-white p-4 text-body-xs text-mist">
        <p>{c.caseNumber} · {c.category.name} · {c.channel.toLowerCase()} · {c.priority.toLowerCase()} · {c.type.toLowerCase()}</p>
        <p>Opener: {c.contactName}{c.contactEmail ? ` · ${c.contactEmail}` : ""}{c.contactPhone ? ` · ${c.contactPhone}` : ""}</p>
        {c.orderId && <p>Order: {c.orderId}</p>}
        {c.relatedReturnId && <p>Linked return: {c.relatedReturnId}</p>}
        <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink">{c.description}</p>
      </div>

      <CaseActions caseId={c.id} status={c.status} />
      <CaseThread messages={messages} showInternal />
      <CaseComposer caseId={c.id} />
    </div>
  );
}
```

- [ ] **Step 5: Verify (keyless, admin on :3002). Create one case first, then open it.**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm --filter @ayvana/admin exec tsc --noEmit
CASE_ID=$(DATABASE_URL="postgresql://postgres:password@localhost:5432/eluna" pnpm --filter @ayvana/db exec tsx -e "import('@ayvana/db').then(async m=>{const cat=await m.prisma.caseCategory.findFirstOrThrow();const r=await m.createCase({type:'COMPLAINT',categoryId:cat.id,channel:'WEBSITE',subject:'Smoke test',description:'x',openerRole:'CUSTOMER',contact:{name:'Test'}});console.log(r.id);process.exit(0)})")
curl -s -o /dev/null -w "detail %{http_code}\n" "http://localhost:3002/cases/$CASE_ID"
```
Expected: tsc clean; detail `200`.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/app/actions/cases.ts "apps/admin/app/(dashboard)/cases/components/CaseActions.tsx" "apps/admin/app/(dashboard)/cases/components/CaseComposer.tsx" "apps/admin/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(admin): case detail, thread, composer + handler actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Opener web surfaces (customer, vendor, supplier)

Each opener app gets a `support` area: a new-case form (reusing `@ayvana/ui` `CaseSubmitForm`), a "my cases" list, and a read-only thread. Identity is resolved server-side per app. Build customer first, then vendor, then supplier — the files are small and near-identical except for identity + base path.

**Files (customer):**
- Create: `apps/customer/app/support/actions.ts`, `apps/customer/app/support/page.tsx`, `apps/customer/app/support/new/page.tsx`, `apps/customer/app/support/[id]/page.tsx`

- [ ] **Step 1: Customer actions + create.** Create `apps/customer/app/support/actions.ts`:

```ts
"use server";

import { createCase, type CaseSubmitResultShape } from "./_shared";
export { submitCustomerCase } from "./_shared";
```

Create `apps/customer/app/support/_shared.ts`:

```ts
"use server";

import { createCase } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";
import { prisma } from "@ayvana/db";

export type CaseSubmitResultShape = { ok: true; caseNumber: string } | { ok: false; error: string };

export async function submitCustomerCase(data: {
  type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
  categoryId: string;
  subject: string;
  description: string;
  contactName: string;
  contactEmail: string;
  orderId?: string;
}): Promise<CaseSubmitResultShape> {
  if (!data.subject.trim() || !data.description.trim()) return { ok: false, error: "Subject and description are required" };
  const user = await safeCurrentUser();
  let customerId: string | null = null;
  if (user) {
    const prof = await prisma.customerProfile.findUnique({ where: { userId: user.id }, select: { id: true } }).catch(() => null);
    customerId = prof?.id ?? null;
  }
  const res = await createCase({
    type: data.type,
    categoryId: data.categoryId,
    channel: "WEBSITE",
    subject: data.subject,
    description: data.description,
    openerUserId: user?.id ?? null,
    openerRole: "CUSTOMER",
    contact: { name: data.contactName, email: data.contactEmail || null },
    links: { customerId, orderId: data.orderId ?? null },
  });
  return { ok: true, caseNumber: res.caseNumber };
}
```

- [ ] **Step 2: Customer new-case page.** Create `apps/customer/app/support/new/page.tsx`:

```tsx
import { prisma } from "@ayvana/db";
import { CaseSubmitForm } from "@ayvana/ui";
import { submitCustomerCase } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const categories = await prisma.caseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }).catch(() => []);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-4 text-display-sm text-ink">Get help</h1>
      <CaseSubmitForm categories={categories} action={submitCustomerCase} />
    </main>
  );
}
```

- [ ] **Step 3: Customer "my cases" list + thread.** Create `apps/customer/app/support/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge } from "@ayvana/ui";
import { safeCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function MyCasesPage() {
  const user = await safeCurrentUser();
  const cases = user
    ? await prisma.case.findMany({ where: { openerUserId: user.id }, orderBy: { createdAt: "desc" }, include: { category: { select: { name: true } } } }).catch(() => [])
    : [];
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-display-sm text-ink">My cases</h1>
        <Link href="/support/new" className="rounded-md bg-ink px-3 py-1.5 text-body-xs text-ivory">New case</Link>
      </div>
      {!user && <p className="text-body-sm text-mist">Sign in to see your cases, or <Link className="underline" href="/support/new">submit a new one</Link>.</p>}
      <div className="flex flex-col gap-2">
        {cases.map((c) => (
          <Link key={c.id} href={`/support/${c.id}`} className="flex items-center gap-3 rounded-lg border border-sand bg-white p-3">
            <div className="flex-1"><p className="text-body-sm text-ink">{c.subject}</p><p className="text-body-xs text-mist">{c.caseNumber} · {c.category.name}</p></div>
            <CaseStatusBadge status={c.status} />
          </Link>
        ))}
      </div>
    </main>
  );
}
```

Create `apps/customer/app/support/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge, CaseThread, type CaseThreadMessage } from "@ayvana/ui";
import { safeCurrentUser } from "../../lib/auth";
import { replyToOwnCase } from "../_shared-thread";
import { OwnCaseComposer } from "../_composer";

export const dynamic = "force-dynamic";

export default async function CaseThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await safeCurrentUser();
  const c = await prisma.case.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } }).catch(() => null);
  if (!c || (user && c.openerUserId && c.openerUserId !== user.id)) redirect("/support");

  const messages: CaseThreadMessage[] = c.messages.map((m) => ({ id: m.id, authorRole: m.authorRole, body: m.body, isInternal: m.isInternal, createdAt: m.createdAt }));
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-3 flex items-center gap-2"><h1 className="text-display-sm text-ink">{c.subject}</h1><CaseStatusBadge status={c.status} /></div>
      <CaseThread messages={messages} />
      <div className="mt-4"><OwnCaseComposer caseId={c.id} action={replyToOwnCase} /></div>
    </main>
  );
}
```

- [ ] **Step 4: Customer opener reply action + composer.** Create `apps/customer/app/support/_shared-thread.ts`:

```ts
"use server";

import { addCaseMessage, prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";

export async function replyToOwnCase(caseId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!body.trim()) return { ok: false, error: "Empty" };
  const user = await safeCurrentUser();
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { openerUserId: true } }).catch(() => null);
  if (!c) return { ok: false, error: "Not found" };
  if (user && c.openerUserId && c.openerUserId !== user.id) return { ok: false, error: "Forbidden" };
  await addCaseMessage({ caseId, authorUserId: user?.id ?? null, authorRole: "CUSTOMER", body: body.trim(), channel: "WEBSITE" });
  return { ok: true };
}
```

Create `apps/customer/app/support/_composer.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

export function OwnCaseComposer({ caseId, action }: { caseId: string; action: (caseId: string, body: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a reply…" className="rounded-md border border-sand p-2 text-body-sm" />
      {error && <p className="text-body-xs text-coral">{error}</p>}
      <button disabled={pending} onClick={() => start(async () => { const r = await action(caseId, body); if (r.ok) setBody(""); else setError(r.error ?? "Failed"); })} className="self-start rounded-md bg-ink px-4 py-1.5 text-body-xs text-ivory disabled:opacity-50">
        {pending ? "Sending…" : "Reply"}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Replicate for vendor + supplier.** Create the same five files under `apps/vendor/app/(dashboard)/support/` and `apps/supplier/app/(dashboard)/support/`, with exactly these differences:
  - Identity: import `getAuthUser` from `@ayvana/auth` instead of `safeCurrentUser`. Resolve `openerUserId = user?.userId ?? null`; `openerRole: "VENDOR"` / `"SUPPLIER"`; set `links.vendorId = user?.vendorId` / `links.supplierId = user?.supplierId`; `authorRole: "VENDOR"` / `"SUPPLIER"`.
  - Base path: links/redirects use `/support` within the dashboard route group (the `(dashboard)` prefix is transparent in URLs).
  - Access guard in the thread/list pages: `if (!user) redirect("/")`.

  Vendor `submit` action body (the one meaningful difference), `apps/vendor/app/(dashboard)/support/_shared.ts`:

```ts
"use server";

import { createCase } from "@ayvana/db";
import { getAuthUser } from "@ayvana/auth";

export type CaseSubmitResultShape = { ok: true; caseNumber: string } | { ok: false; error: string };

export async function submitVendorCase(data: {
  type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
  categoryId: string;
  subject: string;
  description: string;
  contactName: string;
  contactEmail: string;
  orderId?: string;
}): Promise<CaseSubmitResultShape> {
  if (!data.subject.trim() || !data.description.trim()) return { ok: false, error: "Subject and description are required" };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const res = await createCase({
    type: data.type,
    categoryId: data.categoryId,
    channel: "WEBSITE",
    subject: data.subject,
    description: data.description,
    openerUserId: user.userId,
    openerRole: "VENDOR",
    contact: { name: data.contactName, email: data.contactEmail || null },
    links: { vendorId: user.vendorId, orderId: data.orderId ?? null },
  });
  return { ok: true, caseNumber: res.caseNumber };
}
```

  (Supplier is identical with `openerRole: "SUPPLIER"`, `authorRole: "SUPPLIER"`, `links.supplierId = user.supplierId`, `submitSupplierCase`.)

- [ ] **Step 6: Verify (keyless). Vendor/supplier have DEMO_USER_ID personas, so "my cases" resolves; customer is guest.**

Run (dev servers up on :3000/:3001/:3003):
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm --filter @ayvana/customer exec tsc --noEmit && pnpm --filter @ayvana/vendor exec tsc --noEmit && pnpm --filter @ayvana/supplier exec tsc --noEmit
curl -s -o /dev/null -w "customer/support/new %{http_code}\n" http://localhost:3000/support/new
curl -s -o /dev/null -w "vendor/support %{http_code}\n" http://localhost:3001/support
curl -s -o /dev/null -w "supplier/support %{http_code}\n" http://localhost:3003/support
```
Expected: tsc clean on all three; each route `200`.

- [ ] **Step 7: Commit.**

```bash
git add apps/customer/app/support apps/vendor/app/\(dashboard\)/support apps/supplier/app/\(dashboard\)/support
git commit -m "feat(cases): opener support surfaces (customer/vendor/supplier submit + my-cases + thread)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Mobile — `/api/mobile/cases*` + Support screens

**Files:**
- Create: `apps/customer/app/api/mobile/cases/route.ts`, `apps/customer/app/api/mobile/cases/[id]/route.ts`, `apps/customer/app/api/mobile/cases/[id]/messages/route.ts`
- Create: `apps/mobile/src/lib/cases.ts`, `apps/mobile/src/screens/support/{SupportListScreen,NewCaseScreen,CaseThreadScreen}.tsx`

- [ ] **Step 1: List + create route.** Create `apps/customer/app/api/mobile/cases/route.ts`:

```ts
import { prisma, createCase } from "@ayvana/db";
import { resolveMobileCustomer } from "../_customer";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ cases: [] });
  const user = await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } });
  const cases = await prisma.case.findMany({
    where: { openerUserId: user?.userId },
    orderBy: { createdAt: "desc" },
    include: { category: { select: { name: true } } },
    take: 50,
  });
  return Response.json({ cases: cases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status, category: c.category.name, createdAt: c.createdAt })) });
}

export async function POST(req: Request) {
  const customer = await resolveMobileCustomer();
  const body = (await req.json().catch(() => null)) as { type?: string; categoryId?: string; subject?: string; description?: string; contactName?: string; contactEmail?: string } | null;
  if (!body?.categoryId || !body.subject?.trim() || !body.description?.trim()) {
    return Response.json({ error: "categoryId, subject and description are required" }, { status: 400 });
  }
  const user = customer ? await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } }) : null;
  const res = await createCase({
    type: (body.type as "COMPLAINT" | "SUGGESTION" | "QUESTION") ?? "COMPLAINT",
    categoryId: body.categoryId,
    channel: "MOBILE",
    subject: body.subject,
    description: body.description,
    openerUserId: user?.userId ?? null,
    openerRole: "CUSTOMER",
    contact: { name: body.contactName ?? "Mobile user", email: body.contactEmail ?? null },
    links: { customerId: customer?.id ?? null },
  });
  return Response.json({ id: res.id, caseNumber: res.caseNumber });
}
```

- [ ] **Step 2: Detail route.** Create `apps/customer/app/api/mobile/cases/[id]/route.ts`:

```ts
import { prisma } from "@ayvana/db";
import { resolveMobileCustomer } from "../../_customer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await resolveMobileCustomer();
  const c = await prisma.case.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, category: { select: { name: true } } } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const user = customer ? await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } }) : null;
  if (c.openerUserId && user?.userId && c.openerUserId !== user.userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({
    id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status, category: c.category.name,
    messages: c.messages.filter((m) => !m.isInternal).map((m) => ({ id: m.id, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt })),
  });
}
```

- [ ] **Step 3: Reply route.** Create `apps/customer/app/api/mobile/cases/[id]/messages/route.ts`:

```ts
import { prisma, addCaseMessage } from "@ayvana/db";
import { resolveMobileCustomer } from "../../../_customer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body?.body?.trim()) return Response.json({ error: "body is required" }, { status: 400 });
  const customer = await resolveMobileCustomer();
  const c = await prisma.case.findUnique({ where: { id }, select: { openerUserId: true } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const user = customer ? await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } }) : null;
  if (c.openerUserId && user?.userId && c.openerUserId !== user.userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const res = await addCaseMessage({ caseId: id, authorUserId: user?.userId ?? null, authorRole: "CUSTOMER", body: body.body.trim(), channel: "MOBILE" });
  return Response.json({ id: res.id });
}
```

- [ ] **Step 4: Mobile API client.** Create `apps/mobile/src/lib/cases.ts` (follow the base-URL + fetch pattern used by the existing mobile data lib — read `apps/mobile/src/lib/` for the exact `API_BASE` export and reuse it):

```ts
import { API_BASE } from "./api"; // existing helper that resolves localhost:3000 / 10.0.2.2:3000

export type CaseSummary = { id: string; caseNumber: string; subject: string; status: string; category: string; createdAt: string };
export type CaseDetail = { id: string; caseNumber: string; subject: string; status: string; category: string; messages: { id: string; authorRole: string; body: string; createdAt: string }[] };

export async function listCases(): Promise<CaseSummary[]> {
  const r = await fetch(`${API_BASE}/api/mobile/cases`);
  return r.ok ? ((await r.json()).cases ?? []) : [];
}
export async function getCase(id: string): Promise<CaseDetail | null> {
  const r = await fetch(`${API_BASE}/api/mobile/cases/${id}`);
  return r.ok ? await r.json() : null;
}
export async function createCase(input: { type: string; categoryId: string; subject: string; description: string; contactName?: string }): Promise<{ id: string; caseNumber: string } | null> {
  const r = await fetch(`${API_BASE}/api/mobile/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return r.ok ? await r.json() : null;
}
export async function replyToCase(id: string, body: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/api/mobile/cases/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
  return r.ok;
}
```

- [ ] **Step 5: Mobile screens.** Create `apps/mobile/src/screens/support/SupportListScreen.tsx`, `NewCaseScreen.tsx`, `CaseThreadScreen.tsx` using the project's existing RN screen patterns (read an existing screen such as `OrdersScreen` for the `theme`, `Sym` icon, and navigation conventions). Each screen: `SupportListScreen` calls `listCases()` on focus and renders a `FlatList` of cases with a "New case" button; `NewCaseScreen` renders a form (type/category/subject/description) that calls `createCase()` then navigates back; `CaseThreadScreen` calls `getCase(id)`, renders messages, and a reply box calling `replyToCase()`. Register them in the app navigator next to Orders. (Keep styling consistent with the existing screens — ink/sand palette, cut-not-round radii.)

- [ ] **Step 6: Verify the API (keyless; customer dev server on :3000).**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @ayvana/customer exec tsc --noEmit
CAT=$(DATABASE_URL="postgresql://postgres:password@localhost:5432/eluna" pnpm --filter @ayvana/db exec tsx -e "import('@ayvana/db').then(async m=>{const c=await m.prisma.caseCategory.findFirstOrThrow();console.log(c.id);process.exit(0)})")
curl -s -X POST http://localhost:3000/api/mobile/cases -H 'Content-Type: application/json' -d "{\"categoryId\":\"$CAT\",\"subject\":\"Mobile smoke\",\"description\":\"from curl\"}" -w "\nPOST %{http_code}\n"
curl -s -o /dev/null -w "GET list %{http_code}\n" http://localhost:3000/api/mobile/cases
```
Expected: tsc clean; POST returns a JSON `{id,caseNumber}` with HTTP 200; GET list 200.

- [ ] **Step 7: Commit.**

```bash
git add apps/customer/app/api/mobile/cases apps/mobile/src/lib/cases.ts apps/mobile/src/screens/support
git commit -m "feat(cases): mobile cases API + Support screens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: AI triage agent + `classifyCase`

**Files:**
- Modify: `packages/ai/src/session.ts` (add `"CASE"` agent type)
- Create: `packages/ai/src/agents/case.ts`
- Modify: `packages/ai/src/index.ts` (export the agent)

- [ ] **Step 1: Add the CASE agent type.** In `packages/ai/src/session.ts`, change the `AGENT_TYPES` tuple to include `"CASE"`:

```ts
const AGENT_TYPES = ["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS", "SUPPLIER", "CASE"] as const;
```

- [ ] **Step 2: Read `packages/ai/src/agents/seller.ts` + `packages/ai/src/config.ts`** to copy the exact `streamText`/`tool`/`anthropic(AYVANA_MODEL)`/`DEFAULT_SYSTEM_CONTEXT` imports and the session-scoped tool-closure pattern.

- [ ] **Step 3: Implement the agent + classifier.** Create `packages/ai/src/agents/case.ts`:

```ts
import { streamText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@ayvana/db";
import { anthropic, AYVANA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const CASE_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}
You are the AYVANA Case Manager assistant for support/admin staff. Help triage
and resolve customer, vendor, and supplier cases. Ground every suggestion in the
case history retrieved via tools — never invent order numbers, policies, or facts.
You cannot change case state or send messages; you only advise and draft.`;

/** All tools are READ-ONLY. handlerUserId is captured here, never an LLM arg. */
export function buildCaseTools(_handlerUserId: string) {
  return {
    list_open_cases: tool({
      description: "List cases that still need work (not RESOLVED/CLOSED/CANCELLED).",
      parameters: z.object({ limit: z.number().default(20) }),
      execute: async ({ limit }) => {
        const cases = await prisma.case
          .findMany({ where: { status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: limit, select: { id: true, caseNumber: true, subject: true, priority: true, status: true } })
          .catch(() => []);
        return { cases };
      },
    }),
    case_context: tool({
      description: "Full history of one case: fields + non-internal messages.",
      parameters: z.object({ caseId: z.string() }),
      execute: async ({ caseId }) => {
        const c = await prisma.case.findUnique({ where: { id: caseId }, include: { category: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" }, select: { authorRole: true, body: true, isInternal: true, createdAt: true } } } }).catch(() => null);
        if (!c) return { error: "not found" };
        return { case: { ...c, messages: c.messages.filter((m) => !m.isInternal) } };
      },
    }),
    draft_reply: tool({
      description: "Draft a customer-facing reply for the handler to review (does NOT send).",
      parameters: z.object({ caseId: z.string(), tone: z.enum(["apologetic", "neutral", "reassuring"]).default("neutral") }),
      execute: async ({ caseId }) => {
        const c = await prisma.case.findUnique({ where: { id: caseId }, select: { subject: true, description: true } }).catch(() => null);
        return c ? { ok: true, context: c } : { ok: false };
      },
    }),
  };
}

export async function runCaseAgent(messages: CoreMessage[], opts: { handlerUserId: string; onFinish?: (text: string) => void }) {
  return streamText({
    model: anthropic(AYVANA_MODEL),
    system: CASE_SYSTEM,
    messages,
    tools: buildCaseTools(opts.handlerUserId),
    toolChoice: "auto",
    maxSteps: 5,
    onFinish: (r) => opts.onFinish?.(r.text),
  });
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TriageSuggestion = { categorySlug: string; priority: (typeof PRIORITIES)[number] } | null;

/**
 * One-shot classification used by the worker on case.created. Returns null if
 * the model is unavailable (keyless/no key) or the output can't be parsed — the
 * caller simply skips triage.
 */
export async function classifyCase(input: { subject: string; description: string; categorySlugs: string[] }): Promise<TriageSuggestion> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { generateText } = await import("ai");
    const res = await generateText({
      model: anthropic(AYVANA_MODEL),
      prompt: `Classify this support case. Reply with ONLY compact JSON {"categorySlug":"<one of: ${input.categorySlugs.join(", ")}>","priority":"<one of LOW|MEDIUM|HIGH|URGENT>"}.\nSubject: ${input.subject}\nBody: ${input.description}`,
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { categorySlug?: string; priority?: string };
    if (!parsed.categorySlug || !input.categorySlugs.includes(parsed.categorySlug)) return null;
    const priority = (PRIORITIES as readonly string[]).includes(parsed.priority ?? "") ? (parsed.priority as (typeof PRIORITIES)[number]) : "MEDIUM";
    return { categorySlug: parsed.categorySlug, priority };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Export.** In `packages/ai/src/index.ts` add:

```ts
export { runCaseAgent, buildCaseTools, classifyCase } from "./agents/case";
export type { TriageSuggestion } from "./agents/case";
```

- [ ] **Step 5: Typecheck.**

Run: `pnpm --filter @ayvana/ai exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/ai/src/session.ts packages/ai/src/agents/case.ts packages/ai/src/index.ts
git commit -m "feat(ai): case triage agent (read-only tools) + classifyCase helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Public WhatsApp webhook

**Files:**
- Create: `apps/customer/app/api/webhooks/whatsapp/route.ts`

- [ ] **Step 1: Implement the webhook.** Create `apps/customer/app/api/webhooks/whatsapp/route.ts`:

```ts
import { prisma, createCase, addCaseMessage } from "@ayvana/db";
import { getMessagingGateway } from "@ayvana/messaging";

export const dynamic = "force-dynamic";

/** Meta verification handshake (GET): echo hub.challenge when the token matches. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Inbound message (POST): append to the opener's open case, or open a new one. */
export async function POST(req: Request) {
  const raw = await req.text();
  const parsed = getMessagingGateway().parseWebhook(raw, req.headers);
  if (parsed.kind !== "message") return Response.json({ ok: true });

  const existing = await prisma.case
    .findFirst({
      where: { contactPhone: parsed.from, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    .catch(() => null);

  if (existing) {
    await addCaseMessage({ caseId: existing.id, authorRole: "CUSTOMER", body: parsed.text, channel: "WHATSAPP", externalRef: parsed.externalRef ?? null });
    return Response.json({ ok: true, caseId: existing.id });
  }

  const other = await prisma.caseCategory.findUnique({ where: { slug: "other" }, select: { id: true } }).catch(() => null);
  const category = other ?? (await prisma.caseCategory.findFirstOrThrow({ select: { id: true } }));
  const res = await createCase({
    type: "QUESTION",
    categoryId: category.id,
    channel: "WHATSAPP",
    subject: parsed.text.slice(0, 60) || "WhatsApp message",
    description: parsed.text,
    openerRole: "CUSTOMER",
    contact: { name: parsed.from, phone: parsed.from },
  });
  return Response.json({ ok: true, caseId: res.id });
}
```

- [ ] **Step 2: Verify (keyless — Simulated gateway parses the plain `{from,text,id}` body).**

Run (customer dev server on :3000):
```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @ayvana/customer exec tsc --noEmit
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp -H 'Content-Type: application/json' -d '{"from":"+971500000001","text":"my order is late","id":"wamid.smoke1"}' -w "\n%{http_code}\n"
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp -H 'Content-Type: application/json' -d '{"from":"+971500000001","text":"any update?","id":"wamid.smoke2"}' -w "\n%{http_code}\n"
```
Expected: tsc clean; first call returns `{"ok":true,"caseId":...}` (new case), second returns the SAME caseId (appended to the open case); both HTTP 200.

- [ ] **Step 3: Commit.**

```bash
git add apps/customer/app/api/webhooks/whatsapp/route.ts
git commit -m "feat(cases): public WhatsApp inbound webhook (keyless simulated parse)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: `@ayvana/cases` worker — dispatch, notify, SLA sweep, auto-triage

**Files:**
- Create: `packages/cases/{package.json,tsconfig.json,vitest.config.ts}`
- Create: `packages/cases/src/{handlers,worker,index}.ts`
- Test: `packages/cases/test/{setup.ts,handlers.int.test.ts}`

- [ ] **Step 1: Scaffold the package.** Create `packages/cases/package.json`:

```json
{
  "name": "@ayvana/cases",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "worker": "tsx src/worker.ts", "test": "vitest run" },
  "dependencies": {
    "@ayvana/ai": "workspace:*",
    "@ayvana/db": "workspace:*",
    "@ayvana/messaging": "workspace:*"
  },
  "devDependencies": {
    "@ayvana/config": "workspace:*",
    "@types/node": "^20.0.0",
    "dotenv": "^16.4.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/cases/tsconfig.json`:

```json
{ "extends": "@ayvana/config/tsconfig/base", "include": ["src/**/*.ts"], "exclude": ["node_modules"] }
```

Create `packages/cases/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { setupFiles: ["./test/setup.ts"], fileParallelism: false, hookTimeout: 30_000, testTimeout: 30_000 } });
```

Create `packages/cases/test/setup.ts` (same DB redirect as the db package):

```ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../db/.env") });
const url = process.env.DATABASE_URL ?? "";
if (url && !/\/ayvana_test(\?|$)/.test(url)) process.env.DATABASE_URL = url.replace(/\/([^/?]+)(\?|$)/, "/ayvana_test$2");
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/ayvana_test";
process.env.NODE_ENV = "test";
delete process.env.ANTHROPIC_API_KEY; // keep auto-triage deterministic (classifyCase → null)
```

- [ ] **Step 2: Write the failing test.** Create `packages/cases/test/handlers.int.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma, createCase, addCaseMessage } from "@ayvana/db";
import { handleCaseEvent, sweepCaseSla } from "../src/handlers";

async function cat() {
  return prisma.caseCategory.upsert({ where: { slug: "svc-test" }, create: { slug: "svc-test", name: "Svc", defaultPriority: "MEDIUM" }, update: {} });
}
const input = (categoryId: string, over: Record<string, unknown> = {}) => ({
  type: "COMPLAINT" as const, categoryId, channel: "WEBSITE" as const, subject: "s", description: "d",
  openerUserId: `u_${Date.now()}`, openerRole: "CUSTOMER" as const, contact: { name: "A" }, ...over,
});

describe("case worker handlers (integration)", () => {
  it("case.message_added on a WHATSAPP opener reply writes an opener notification to no-op, and a handler reply notifies the opener", async () => {
    const c = await cat();
    const { id } = await createCase(input(c.id));
    const msg = await addCaseMessage({ caseId: id, authorUserId: "agent1", authorRole: "SUPPORT", body: "hi", channel: "WEBSITE" });
    await handleCaseEvent({ id: "e1", type: "case.message_added", payload: { caseId: id, messageId: msg.id }, attempts: 0 });
    const notifs = await prisma.notification.findMany({ where: { type: "CASE_UPDATE" } });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it("sweepCaseSla emits case.sla_breached for overdue open cases and is idempotent", async () => {
    const c = await cat();
    const { id } = await createCase(input(c.id, { priority: "URGENT" }));
    await prisma.case.update({ where: { id }, data: { resolutionDueAt: new Date(Date.now() - 3600_000) } });
    const first = await sweepCaseSla();
    expect(first).toBeGreaterThanOrEqual(1);
    const breached = await prisma.outboxEvent.findMany({ where: { type: "case.sla_breached", payload: { path: ["caseId"], equals: id } } });
    expect(breached).toHaveLength(1);
    await sweepCaseSla(); // second sweep must not double-emit
    const again = await prisma.outboxEvent.findMany({ where: { type: "case.sla_breached", payload: { path: ["caseId"], equals: id } } });
    expect(again).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run to verify it fails.**

Run: `pnpm install && pnpm --filter @ayvana/cases test`
Expected: FAIL — `Cannot find module '../src/handlers'`.

- [ ] **Step 4: Implement the handlers.** Create `packages/cases/src/handlers.ts`:

```ts
import { prisma, applyCaseTriage, type OutboxRecord } from "@ayvana/db";
import { getMessagingGateway } from "@ayvana/messaging";
import { classifyCase } from "@ayvana/ai";

const OPEN_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"] as const;
const HANDLER_ROLES = ["SUPPORT", "CALL_CENTER", "ADMIN"] as const;

async function notify(userId: string | null | undefined, title: string, body: string, caseId: string) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, type: "CASE_UPDATE", title, body, data: { caseId } } }).catch(() => null);
}

/** Idempotent outbox handler for case.* events. */
export async function handleCaseEvent(event: OutboxRecord): Promise<void> {
  const payload = (event.payload ?? {}) as { caseId?: string; messageId?: string };
  if (!payload.caseId) return;

  if (event.type === "case.created") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { subject: true, description: true, suggestedCategoryId: true } });
    if (c && !c.suggestedCategoryId) {
      const cats = await prisma.caseCategory.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
      const suggestion = await classifyCase({ subject: c.subject, description: c.description, categorySlugs: cats.map((x) => x.slug) });
      if (suggestion) {
        const match = cats.find((x) => x.slug === suggestion.categorySlug);
        await applyCaseTriage(payload.caseId, { suggestedCategoryId: match?.id ?? null, suggestedPriority: suggestion.priority });
      }
    }
    return;
  }

  if (event.type === "case.message_added" && payload.messageId) {
    const msg = await prisma.caseMessage.findUnique({ where: { id: payload.messageId }, select: { authorRole: true, isInternal: true, body: true, channel: true } });
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, contactPhone: true, caseNumber: true } });
    if (!msg || !c || msg.isInternal) return;

    // Handler → opener: in-app notification + (if the case came via WhatsApp) outbound WhatsApp.
    if ((HANDLER_ROLES as readonly string[]).includes(msg.authorRole)) {
      await notify(c.openerUserId, `Update on ${c.caseNumber}`, msg.body.slice(0, 160), payload.caseId);
      if (msg.channel === "WHATSAPP" && c.contactPhone) {
        await getMessagingGateway().sendMessage({ phone: c.contactPhone, text: msg.body });
      }
    }
    return;
  }

  if (event.type === "case.assigned") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, caseNumber: true } });
    await notify(c?.openerUserId, `${c?.caseNumber} assigned`, "Your case is now being handled.", payload.caseId);
    return;
  }

  if (event.type === "case.resolved") {
    const c = await prisma.case.findUnique({ where: { id: payload.caseId }, select: { openerUserId: true, caseNumber: true } });
    await notify(c?.openerUserId, `${c?.caseNumber} resolved`, "Your case has been resolved.", payload.caseId);
    return;
  }
}

/**
 * Emit `case.sla_breached` once per overdue open case. Idempotent via an
 * ESCALATED CaseEvent marker: a case that already has one is skipped.
 */
export async function sweepCaseSla(now: Date = new Date()): Promise<number> {
  const overdue = await prisma.case.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, resolutionDueAt: { lt: now } },
    select: { id: true },
  });
  let emitted = 0;
  for (const c of overdue) {
    const already = await prisma.caseEvent.findFirst({ where: { caseId: c.id, type: "ESCALATED" }, select: { id: true } });
    if (already) continue;
    await prisma.$transaction(async (tx) => {
      await tx.caseEvent.create({ data: { caseId: c.id, type: "ESCALATED", data: { reason: "sla_resolution_overdue" } } });
      await tx.outboxEvent.create({ data: { type: "case.sla_breached", payload: { caseId: c.id } } });
    });
    emitted++;
  }
  return emitted;
}
```

- [ ] **Step 5: Implement the worker loop + index.** Create `packages/cases/src/worker.ts`:

```ts
import { processOutbox } from "@ayvana/db";
import { handleCaseEvent, sweepCaseSla } from "./handlers";

const CASE_EVENT_PREFIX = "case.";

async function tick() {
  await processOutbox(async (event) => {
    if (event.type.startsWith(CASE_EVENT_PREFIX)) await handleCaseEvent(event);
  });
  await sweepCaseSla();
}

async function main() {
  console.info("[cases-worker] started");
  for (;;) {
    await tick().catch((e) => console.error("[cases-worker]", e));
    await new Promise((r) => setTimeout(r, 5000));
  }
}

void main();
```

Create `packages/cases/src/index.ts`:

```ts
export { handleCaseEvent, sweepCaseSla } from "./handlers";
```

- [ ] **Step 6: Run the test.**

Run: `pnpm --filter @ayvana/cases test`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit.**

```bash
git add packages/cases
git commit -m "feat(cases): outbox worker — notify/dispatch/SLA sweep + auto-triage on create

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run every new/affected test suite.**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm --filter @ayvana/db test && pnpm --filter @ayvana/messaging test && pnpm --filter @ayvana/cases test
```
Expected: all suites pass.

- [ ] **Step 2: Typecheck every touched package + app.**

Run:
```bash
pnpm --filter @ayvana/db --filter @ayvana/messaging --filter @ayvana/cases --filter @ayvana/ai --filter @ayvana/ui --filter @ayvana/auth exec tsc --noEmit
pnpm --filter @ayvana/admin --filter @ayvana/customer --filter @ayvana/vendor --filter @ayvana/supplier exec tsc --noEmit
```
Expected: no type errors anywhere.

- [ ] **Step 3: Keyless runtime smoke across the surfaces** (dev servers up on :3000/:3001/:3002/:3003; cases worker running via `pnpm --filter @ayvana/cases worker`).

Run:
```bash
curl -s -o /dev/null -w "admin /cases %{http_code}\n" http://localhost:3002/cases
curl -s -o /dev/null -w "customer /support/new %{http_code}\n" http://localhost:3000/support/new
curl -s -o /dev/null -w "vendor /support %{http_code}\n" http://localhost:3001/support
curl -s -o /dev/null -w "supplier /support %{http_code}\n" http://localhost:3003/support
curl -s -o /dev/null -w "mobile cases %{http_code}\n" http://localhost:3000/api/mobile/cases
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp -H 'Content-Type: application/json' -d '{"from":"+971500000009","text":"final smoke","id":"wamid.final"}' -w "\nwhatsapp %{http_code}\n"
```
Expected: every route returns 200 and the WhatsApp POST returns a JSON body with a `caseId`.

- [ ] **Step 4: Confirm the demo shim was never committed on this branch.**

Run: `git log feature/case-manager --name-only --pretty=format:'' | sort -u | grep -E 'middleware\.ts|lib/auth\.ts|/layout\.tsx|api/demo' || echo "clean — no shim files committed"`
Expected: prints `clean — no shim files committed`.

- [ ] **Step 5: Hand off to finishing-a-development-branch** to open the PR (CI: lint/typecheck/tests/build/CodeQL/Trivy/gitleaks). Watch for the `next/font` CDN flake (re-run the failed build job if it hits) and resolve any real CodeQL findings before merge.

---

## Self-Review

**Spec coverage** (spec §→task):
- §2 packages/placement → Tasks 1–2 (db), 8 (messaging), 9 (auth), 10 (ui), 15 (ai), 17 (cases worker), 11–14/16 (apps). ✓
- §3 data model (4 models + enums + role/agent/notification additions) → Task 1. ✓
- §4 state machine → Task 3. ✓
- §5 channels: website → Task 13; mobile → Task 14; WhatsApp inbound/outbound → Tasks 16 (inbound) + 17 (outbound dispatch). ✓
- §6 roles/access/isolation → Task 9 (roles) + per-page/per-action guards in Tasks 11–14 + opener isolation checks. ✓
- §7 handler console → Tasks 11–12. ✓
- §8 outbox events + worker + AI triage → Tasks 4–7 (event emission), 17 (worker/notify/SLA), 15 + 17 (auto-triage). ✓
- §9 error/edge (gateways never throw, illegal transitions throw, WhatsApp dedupe by phone, keyless) → Tasks 3, 8, 16, 17. ✓
- §10 testing → vitest tasks throughout + Task 18. ✓
- §11 refund hand-off via `relatedReturnId` → Task 7 (`resolveCase`) + Task 12 (`resolveCaseAction`). ✓

**Deferred (spec §1, intentionally not planned):** vendor-as-respondent, email channel, live WhatsApp keys, CSAT/macros/KB.

**Type consistency:** `createCase(CreateCaseInput)`, `addCaseMessage(AddCaseMessageInput)`, `assignCase`, `transitionCase`, `resolveCase`, `reopenCase`, `applyCaseTriage`, `listCases`/`getCaseDetail` are defined in Tasks 4–7 and consumed with the same signatures in Tasks 11–17. `MessagingGateway.sendMessage/parseWebhook` (Task 8) are consumed in Tasks 16–17. `classifyCase` (Task 15) is consumed in Task 17. Enum string literals (`CaseStatus`, `CaseChannel`, `CaseAuthorRole`, `CaseType`) match Task 1 throughout.

**Open integration note for the executor:** Task 14 Step 4 imports `API_BASE` from the mobile app's existing API helper — confirm the exact export name/path by reading `apps/mobile/src/lib/` before writing (the mobile app is outside the pnpm workspace and may name it differently).
