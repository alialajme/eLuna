# e-Luna — Architecture

This document describes the e-Luna platform architecture as it stands after the production-hardening
effort (see `docs/PRODUCTION-HARDENING.md` and PRs #1–#4). Diagrams are Mermaid so they render on
GitHub and stay in-repo next to the code.

- **Style:** modular monolith — a Turborepo of four Next.js 15 apps sharing typed packages. Strong
  internal module boundaries; not split into microservices (see ADR-0001).
- **Personas / apps:** `customer` (luna.ae), `vendor` (sell.luna.ae), `admin` (ops.luna.ae),
  `supplier` (supply.luna.ae).
- **Shared packages:** `ui`, `db` (Prisma + domain services), `ai`, `auth`, `config`, `payments`,
  `courier`, `einvoice`, `observability`.

---

## 1. System context

```mermaid
graph TB
  Customer([Customer]) --> C[customer app<br/>luna.ae]
  Vendor([Vendor]) --> V[vendor app<br/>sell.luna.ae]
  Admin([Admin]) --> A[admin app<br/>ops.luna.ae]
  Supplier([Supplier]) --> S[supplier app<br/>supply.luna.ae]

  subgraph eLuna[e-Luna platform]
    C & V & A & S --> DB[(PostgreSQL)]
  end

  C -. auth .-> Clerk[Clerk]
  V & A & S -. auth .-> Clerk
  C --> Stripe[Stripe / BNPL / NeoPay]
  C & V & S --> Courier[Aramex / DHL]
  S & V --> FTA[UAE FTA e-invoicing]
  C & V & S --> Anthropic[Anthropic Claude]
  C --> Cloudinary[Cloudinary]
```

External integrations are **credential-gated and fail closed**: absent real credentials, providers
either are hidden from the UI or fall back to a Simulated adapter that is forbidden from "capturing"
in production (see ADR-0002).

---

## 2. Container / component architecture

```mermaid
graph LR
  subgraph apps
    C[customer] & V[vendor] & A[admin] & S[supplier]
  end
  subgraph packages
    UI[ui] 
    AUTH[auth<br/>roles · rate-limit]
    DB[db<br/>prisma · money · inventory<br/>wallet · ledger · outbox · errors]
    PAY[payments<br/>gateway · reconcile]
    COUR[courier]
    INV[einvoice]
    AI[ai agents]
    OBS[observability<br/>logger · correlation]
    CFG[config<br/>eslint · ts · security headers]
  end
  C & V & A & S --> AUTH & DB & AI & UI & OBS
  C --> PAY
  V & S --> COUR & INV
  PAY --> DB
```

Domain/financial logic lives in `@e-luna/db` (money, inventory reservation, wallet ledger, financial
ledger, order/payment/payout state machines, outbox, typed errors) so it is unit/integration-tested
independently of the Next.js layer. Server actions stay thin: authenticate → validate → call a
service → map result.

---

## 3. Deployment architecture (Azure)

```mermaid
graph TB
  Internet --> FD[Front Door / WAF<br/>*planned outer layer*]
  FD --> Ingress[NGINX Ingress + cert-manager]
  subgraph AKS[AKS - UAE North]
    Ingress --> C[customer pods] & V[vendor pods] & A[admin pods] & S[supplier pods]
    C & V & A & S --> KV[Key Vault CSI<br/>workload identity]
  end
  C & V & A & S --> PG[(PostgreSQL Flexible Server<br/>Zone-redundant HA, private)]
  ACR[(ACR)] --> AKS
  AKS --> LA[Log Analytics / App Insights]
```

All four apps are built (multi-stage Dockerfile, non-root) and deployed via one Helm chart with
per-app Deployment/Service/Ingress/HPA/PDB, `runAsNonRoot` + dropped capabilities, and split
liveness (`/api/health/live`) / readiness (`/api/health/ready`, DB-checked) probes. A CI guard
(`scripts/check-deploy-parity.mjs`) fails the build if any app is missing from deploy config.

---

## 4. Checkout & payment sequences

### Card (async, order-first)

```mermaid
sequenceDiagram
  participant U as Customer
  participant App as customer app
  participant DB as PostgreSQL
  participant Stripe
  U->>App: initiateCardPayment(addressId)
  App->>DB: $tx: reserveStock + create PENDING order + PENDING txn
  App->>Stripe: createPayment(orderId)
  Stripe-->>App: requires_action(clientSecret)
  App-->>U: clientSecret (Payment Element)
  U->>Stripe: confirm payment
  Stripe-->>App: webhook payment_intent.succeeded (verified)
  App->>DB: $tx: order→CONFIRMED, txn→CAPTURED, outbox(payment.captured, order.confirmed)
  Note over App,DB: idempotent — only PENDING orders transition
```

### Wallet (synchronous, atomic)

```mermaid
sequenceDiagram
  participant U as Customer
  participant App as customer app
  participant DB as PostgreSQL
  U->>App: placeOrder(LUNA_WALLET)
  App->>DB: $tx: reserveStock + create CONFIRMED order + debitWallet(atomic guard) + ledger row
  Note over DB: walletBalance>=total enforced atomically → no double-spend
  App-->>U: orderId
```

COD creates a CONFIRMED order but leaves the payment **PENDING** until cash is collected.

### Inventory reservation (no oversell)

```mermaid
sequenceDiagram
  participant R1 as Request A
  participant R2 as Request B
  participant DB as PostgreSQL (stock=1)
  R1->>DB: UPDATE stock=stock-1 WHERE stock>=1 (row lock)
  R2->>DB: same UPDATE (blocks on A)
  DB-->>R1: count=1 (reserved)
  DB-->>R2: count=0 → InsufficientInventoryError (rollback)
```

### Payout (race-safe)

```mermaid
sequenceDiagram
  participant Admin
  participant DB as PostgreSQL
  Admin->>DB: createVendorPayout → $tx: SELECT vendor FOR UPDATE
  DB->>DB: computeVendorBalance (net − reserved(PENDING/PROCESSING) − paidOut)
  alt available > 0
    DB-->>Admin: one PENDING payout
  else
    DB-->>Admin: NO_BALANCE
  end
  Note over Admin,DB: concurrent calls serialize on the lock → never double-paid
```

### Refund

```mermaid
sequenceDiagram
  participant Vendor
  participant GW as Gateway
  participant DB as PostgreSQL
  Vendor->>DB: refundReturn — computeRefundBreakdown (bound ≤ captured; split net/commission)
  alt payment CAPTURED
    Vendor->>GW: refund(gross)  %% money first, abort on failure
    GW-->>Vendor: ok
  end
  Vendor->>DB: $tx: return→REFUNDED, item→RETURNED, restock?, txn→(PARTIALLY_)REFUNDED, ledger REFUND+COMMISSION, audit
```

---

## 5. Reliability — transactional outbox

```mermaid
sequenceDiagram
  participant Tx as Domain transaction
  participant DB as OutboxEvent
  participant W as Worker(s)
  Tx->>DB: appendOutboxEvent(type,payload)  %% same commit as state change
  W->>DB: UPDATE ... FOR UPDATE SKIP LOCKED → PROCESSING (visibility timeout)
  W->>W: idempotent handler
  alt success
    W->>DB: PROCESSED
  else failure
    W->>DB: PENDING (+backoff) until maxAttempts → FAILED
  end
```

---

## 6. Security & observability

- **AuthN:** Clerk (per-app instance); `getAuthUser()` reads role/vendorId/supplierId only from
  trusted server-side session claims.
- **AuthZ:** every server action re-checks role AND resource ownership (`where: { id, vendorId }` /
  post-load owner check) — audited, no horizontal privilege escalation (see THREAT-MODEL).
- **Headers:** shared HSTS/nosniff/frame-ancestors/Referrer-Policy/Permissions-Policy on all apps.
- **Rate limiting:** `@e-luna/auth` limiter on AI endpoints (Redis-swappable interface).
- **Audit log:** immutable `AuditLog`, written transactionally for payout/vendor/refund actions.
- **Observability:** `@e-luna/observability` structured JSON logger with correlation IDs + secret
  redaction; adopted in checkout + webhook (rollout ongoing).

See `docs/adr/` for the decisions behind these, and `docs/PRODUCTION-HARDENING.md` for status.
