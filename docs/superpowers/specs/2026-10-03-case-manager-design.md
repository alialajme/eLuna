# Case Manager — Design Spec

**Date:** 2026-10-03
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feature/case-manager`

## 1. Summary

A unified **Case Manager** for AYVANA. **Openers** — customers, vendors, and
suppliers — submit **complaints, suggestions, or questions** from **website,
mobile, or WhatsApp**, each case filed under a **category** (service, refund,
studio, delivery, product-quality, payment, suggestion, other). **Handlers** —
call-center, support, and admin teams — triage, assign, reply to, and resolve
cases from a console inside the existing admin app.

The system runs **fully keyless today** (WhatsApp degrades to a simulated,
logged channel) and lights up real messaging when provider keys are supplied.

### Approved decisions

1. **Console placement:** extend the existing admin app with a `/cases` section;
   add new `SUPPORT` and `CALL_CENTER` roles alongside `ADMIN`.
2. **Handler actions:** reply + assign + status + priority/category + link order;
   when the resolution is a refund, **hand off to the existing returns/refund
   module** rather than duplicating refund logic.
3. **WhatsApp:** build a credential-gated `@ayvana/messaging` gateway with a
   Simulated fallback now (logs instead of sends) + an inbound webhook; flip to
   Meta/Twilio when keys arrive.
4. **AI triage agent:** include an AYVANA Case agent (auto-categorize, suggest
   priority, draft reply suggestions) — read-only, session-scoped, human-approved.

### Out of scope for v1 (future phases)

- Vendor/supplier as a **respondent** mediating their own cases (v1: they are
  openers only; the support team mediates).
- **Email** channel ingestion.
- **Live WhatsApp** credentials (scaffold + simulated only).
- CSAT/satisfaction surveys, macros/canned-response library, knowledge base.

## 2. Architecture & code placement

Follows established AYVANA conventions (domain logic in `@ayvana/db`, neutral
credential-gated gateways as their own packages, AI agents in `@ayvana/ai`,
async via the transactional outbox + worker).

| Unit | Location | Responsibility |
|---|---|---|
| **`@ayvana/messaging`** *(new pkg)* | `packages/messaging/src/{gateway,config,factory,simulated,whatsapp}.ts` | Neutral `MessagingGateway` interface; `hasWhatsapp()` config gate; factory that never throws; `SimulatedMessaging` (logs, keyless); `WhatsappGateway` (Meta Cloud API scaffold). Mirrors `payments`/`courier`/`einvoice`. |
| **Case domain** | `packages/db/src/cases.ts` | `createCase`, `addMessage`, `assignCase`, `transition`, `resolveCase`, `reopenCase`; all writes append a `CaseEvent` and (where relevant) an `OutboxEvent` in the same transaction. |
| **State machine** | `packages/db/src/case-status.ts` | Allowed-transition map + `assertTransition()`, mirroring the extracted order-status machine. |
| **Seed** | `packages/db/prisma/seed` | Seed the 8 default `CaseCategory` rows. |
| **AI agent** | `packages/ai/src/agents/case.ts` | `runCaseAgent` + `buildCaseTools` (read-only, session-scoped). |
| **Admin console** | `apps/admin/app/(dashboard)/cases/` + `apps/admin/app/actions/cases.ts` | Queue list, detail/thread, server actions. |
| **Opener surfaces** | `apps/{customer,vendor,supplier}/app/.../support` | "Get help" submit form + "My cases" list + thread/reply. |
| **Mobile** | `apps/customer/app/api/mobile/cases/*` + `apps/mobile` Support screens | Submit/list/detail/reply over the existing mobile API pattern. |
| **WhatsApp webhook** | `apps/customer/app/api/webhooks/whatsapp/route.ts` | Public inbound endpoint (no auth) → gateway parse → create/append case. |
| **Worker** | extend `@ayvana/studio` worker or a sibling cases worker | Drains outbox: outbound channel dispatch, in-app notifications, SLA escalation. |

## 3. Data model (Prisma)

Conventions: `cuid()` PKs, `Decimal @db.Decimal(10,2)` money, `createdAt`/
`updatedAt`, UpperCamelCase status enums, status included in filter indexes.

### `Case`
- `id` cuid PK; `caseNumber` String @unique (human ref, e.g. `CS-2026-0001`).
- `type` `CaseType` (COMPLAINT | SUGGESTION | QUESTION).
- `categoryId` → `CaseCategory`.
- `channel` `CaseChannel` (WEBSITE | MOBILE | WHATSAPP).
- `status` `CaseStatus` @default(NEW).
- `priority` `CasePriority` @default(MEDIUM).
- `subject` String; `description` String.
- **Opener:** `openerUserId` String? ; `openerRole` `CaseOpenerRole` (CUSTOMER |
  VENDOR | SUPPLIER); denormalized `contactName` / `contactEmail?` /
  `contactPhone?` (for guest + WhatsApp replies).
- **Optional links:** `customerId?`, `vendorId?`, `supplierId?`, `orderId?`,
  `studioSessionId?` (nullable FKs, matching how the repo links across domains).
- **Assignment:** `assignedToUserId` String? ; `assignedTeam` `CaseTeam?`
  (SUPPORT | CALL_CENTER).
- **SLA/lifecycle timestamps:** `firstResponseDueAt?`, `resolutionDueAt?`,
  `firstRespondedAt?`, `resolvedAt?`, `closedAt?`.
- **Refund hand-off:** `relatedReturnId` String? (links to the existing returns
  record when a refund resolution is created there).
- `createdAt`, `updatedAt`.
- Indexes: `[status]`, `[assignedToUserId, status]`, `[customerId]`,
  `[vendorId]`, `[supplierId]`, `[channel]`, `[categoryId]`, `[priority, status]`.

### `CaseMessage`
- `id`; `caseId` → Case; `authorUserId` String? (null for SYSTEM / inbound guest);
  `authorRole` `CaseAuthorRole` (CUSTOMER | VENDOR | SUPPLIER | SUPPORT |
  CALL_CENTER | ADMIN | SYSTEM); `body` String; `isInternal` Boolean @default(false)
  (internal notes never shown to the opener); `channel` `CaseChannel`;
  `attachments` Json @default("[]"); `externalRef` String? (provider message id).
- `createdAt`. Index `[caseId, createdAt]`, `[authorUserId]`.

### `CaseCategory`
- `id`; `slug` @unique; `name`; `description?`; `defaultPriority` `CasePriority`;
  `defaultTeam` `CaseTeam?`; `isActive` Boolean @default(true); `sortOrder` Int.
- Seeded: `service`, `refund`, `studio`, `delivery`, `product-quality`,
  `payment`, `suggestion`, `other` (admin-editable, like the existing category mgmt).

### `CaseEvent` (append-only timeline / audit)
- `id`; `caseId` → Case; `actorUserId` String?; `type` `CaseEventType` (CREATED |
  ASSIGNED | STATUS_CHANGED | MESSAGE | ESCALATED | RESOLVED | REOPENED |
  CATEGORY_CHANGED | PRIORITY_CHANGED); `data` Json @default("{}"); `createdAt`.
- Index `[caseId, createdAt]`. Never updated/deleted.

### Enums & reused models
- New enums: `CaseType`, `CaseStatus`, `CasePriority`, `CaseChannel`,
  `CaseOpenerRole`, `CaseAuthorRole`, `CaseTeam`, `CaseEventType`.
- `UserRole` (Prisma + `@ayvana/auth`): add `SUPPORT`, `CALL_CENTER`.
- **Attachments** stored via `@ayvana/storage` (SimulatedStorage keyless).
- **In-app notifications** reuse the existing (currently unused) `Notification`
  model (`{ userId, type, title, body, isRead, data }`).

## 4. State machine (`packages/db/src/case-status.ts`)

```
NEW ──assign──▶ ASSIGNED ──respond──▶ IN_PROGRESS ⇄ WAITING_CUSTOMER
                                           │
                                           └──resolve──▶ RESOLVED ──close──▶ CLOSED
CANCELLED  ◀── (admin, from any open state)
REOPEN:  RESOLVED | CLOSED ──▶ IN_PROGRESS
```

- Transitions validated by `assertTransition(from, to)`; illegal transitions throw.
- First handler reply sets `firstRespondedAt`; entering `RESOLVED` sets
  `resolvedAt`; `CLOSED` sets `closedAt`.

## 5. Channels & ingestion

- **Website:** a "Get help / Support" form in each opener app
  (customer/vendor/supplier). Order detail offers "Get help with this order"
  (prefills `orderId`). A server action calls `createCase`. Category + type chosen
  in the form; priority defaulted from the category (overridable by handlers).
- **Mobile:** `apps/customer/app/api/mobile/cases` route handlers
  (`POST` create, `GET` list, `GET /[id]` detail, `POST /[id]/messages` reply),
  reusing the existing `/api/mobile/*` + Prisma pattern. New `apps/mobile` Support
  screens: My Cases (list), New Case (form), Case thread (messages + reply).
- **WhatsApp:** public `POST/GET /api/webhooks/whatsapp` in the customer app
  (public domain, no auth; GET = Meta verification challenge). Inbound →
  `messagingGateway.parseWebhook()` → match an open case by `contactPhone` (else
  create a new one) → append a `CaseMessage` (channel=WHATSAPP). Outbound: any
  handler reply with channel=WHATSAPP enqueues an outbox event → worker →
  `messagingGateway.sendMessage()`. Keyless: `SimulatedMessaging` logs the
  payload and returns a synthetic ref.

## 6. Roles, access & isolation

- Add `SUPPORT` + `CALL_CENTER` to `UserRole` (Prisma enum + `@ayvana/auth`
  `roles.ts`); optional `supportTeamId` in Clerk session claims if per-team
  routing is needed later.
- Admin `/cases/**` gated to `ADMIN | SUPPORT | CALL_CENTER` at the layout and
  re-checked in every server action (defense-in-depth, matching the admin app).
- **Openers** see only their own cases in their own app, scoped by the
  session-resolved `openerUserId` (+ `customerId`/`vendorId`/`supplierId`).
  Identity is never a client or LLM parameter.
- **Handlers** see the full queue; `CALL_CENTER` is first-line (triage/assign),
  `SUPPORT` resolves, `ADMIN` has everything incl. category management.

## 7. Handler console (`apps/admin/app/(dashboard)/cases`)

- **`/cases`** — queue list (RSC): filters (status, category, channel, priority,
  assigned-to-me / unassigned, team), sorted by priority then SLA-due.
  Sidebar entry `{ icon: "inbox", label: "Cases", href: "/cases" }`.
- **`/cases/[id]`** — detail (RSC + action islands): header (opener, contact,
  links, category, priority, SLA badges incl. "overdue"); message thread (public
  messages + internal-note toggle); composer (reply → choose outbound channel; or
  add internal note); action islands: Assign (to me / agent / team), Change status,
  Set priority/category, Escalate, Resolve, Reopen, Link order, **"Create refund in
  returns"** hand-off.
- `apps/admin/app/actions/cases.ts` — `assignCaseAction`, `addMessageAction`,
  `setStatusAction`, `setPriorityCategoryAction`, `resolveCaseAction`,
  `reopenCaseAction` — each re-checks role, calls the `@ayvana/db` domain helper,
  and `revalidatePath`. Built on the existing list/detail + StatusFilter +
  server-action + island patterns; charts (if any case KPIs) use the hand-rolled
  SVG `LineChart`/`BarChart`.

## 8. Async, notifications & AI

### Outbox + worker
- Events appended in-transaction: `case.created`, `case.assigned`,
  `case.message_added`, `case.status_changed`, `case.resolved`,
  `case.sla_breached`.
- The worker (`processOutbox` with `FOR UPDATE SKIP LOCKED`, exponential backoff)
  handles: outbound WhatsApp dispatch via the messaging gateway; writing in-app
  `Notification` rows for openers/handlers; an SLA sweep that emits
  `case.sla_breached` + escalation when `resolutionDueAt` passes on an open case.

### AI triage agent (`packages/ai/src/agents/case.ts`)
- `runCaseAgent({ handlerUserId })` — gated to `ADMIN | SUPPORT | CALL_CENTER`.
- Read-only, session-scoped tools (identity captured in closure, never an LLM
  param): `list_open_cases`, `case_context(caseId)`, `suggest_category_priority`,
  `draft_reply(caseId)`. **No mutations and no auto-send via the LLM** — handlers
  approve drafts before they post.
- On `case.created`, an outbox handler runs auto-triage to pre-fill a **suggested**
  category + priority stored on the case; a human confirms/overrides.
- Session persistence via the existing `AISession` pattern (agent type `CASE`).

## 9. Error handling & edge cases

- Gateways **never throw** — unconfigured WhatsApp degrades to Simulated.
- Illegal state transitions throw at the domain layer (surface a clean handler error).
- Guest / WhatsApp submissions without an account: `openerUserId = null`, contact
  captured; inbound matching dedupes by `contactPhone` + an existing open case.
- Attachments go through `@ayvana/storage` (Simulated keyless); size/type validated.
- Isolation enforced both in queries and in every server action.

## 10. Testing (vitest, keyless — repo convention)

- `createCase` per channel (website/mobile/whatsapp) sets the right defaults.
- State machine: representative legal transitions succeed; illegal ones throw.
- Opener isolation: an opener cannot read another opener's case; handlers can.
- `SimulatedMessaging.sendMessage` returns a synthetic ref; factory never throws.
- WhatsApp webhook: inbound payload creates/append-matches a case + `CaseMessage`.
- AI agent tools are read-only and identity-scoped (cannot cross openers).
- Outbox handler dispatches the right side effects per event type; SLA sweep emits
  `case.sla_breached` when overdue.

## 11. Phasing (all v1)

The full feature above is v1 ("complete case manager"). The only deliberately
deferred pieces are listed in §1 "Out of scope." Real WhatsApp keys, email, and
vendor-as-respondent are clean future extensions on top of these interfaces.
