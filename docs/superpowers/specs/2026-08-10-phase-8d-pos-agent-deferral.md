# Phase 8d: POS Agent — Decision: DEFERRED

## Decision

**8d (POS agent) is deferred.** It is not built now. This is a deliberate scope decision, not an oversight.

## Why

e-Luna is an **online-only** marketplace. The POS ("point of sale") agent stub (`packages/ai/src/agents/pos.ts`) describes an **omnichannel / in-store** world that does not exist in the codebase, so none of its tools can be grounded in real data — which would violate the project's core agent rule: *every agent grounds its answers in real data; never invent numbers*.

The stub's four tools have no backing:
- `sync_inventory` (online ↔ in-store) — inventory is **single-channel** (`ProductVariant.stock`); there is no second channel to sync with.
- `merge_loyalty` (in-store points → online account) — loyalty is **online-only** (`CustomerProfile.loyaltyPoints`); there are no in-store points.
- `process_return` (in-store returns) — returns already exist as the **7b online vendor-driven flow**; there is no in-store return channel.
- `qr_lookup` — there are **no QR codes** for products/orders in the schema or apps.

Wiring the agent today would produce a fake agent returning empty stub data — worse than not shipping it.

## What 8d would require first

A real POS agent needs an **in-store / omnichannel subsystem** built first — effectively a new product line, not an agent-wiring phase:
- In-store transaction + register data models (a POS sale, tender, drawer).
- A register/checkout-counter surface (staff-facing app or view).
- QR generation + lookup for products/orders.
- Multi-channel inventory (per-channel stock, reservation, and reconciliation).
- In-store loyalty accrual + merge into the online `CustomerProfile`.

When that channel exists, the POS agent can be wired following the established pattern (`buildPOSTools(scopeId)` + `runPOSAgent(messages, ctx)`, session-resolved scoping, ownership-checked read tools) and can reuse the 8e persistence helpers (`persistOnFinish`/`loadAgentMessages` with `agentType: "POS"`).

## Status of the AI Agent Mesh (Phase 8)

- **8a Seller** ✅ · **8b Payment** ✅ · **8c Logistics** ✅ · **8e AISession persistence** ✅
- **8d POS** — 🔲 deferred (blocked on an omnichannel/in-store channel).
- Studio AI is Phase 5 (separate, already shipped).

The customer/vendor agent mesh is functionally complete (4 live conversational agents + persistence). POS remains a stub until there is a real in-store channel to serve.
