import type { Prisma, StudioBillingCycle, StudioSubscriptionStatus } from "@prisma/client";
import { prisma } from "./client";
import { money, round2, type Money } from "./money";
import { grantCredit } from "./studio-credits";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

// ─────────────────────────────────────────────
// AI Fashion Studio — plans, packs, subscriptions (config-in-DB), cost + margin
//
// Plan/pack params live in the DB (admin-editable, never hard-coded in app code).
// `seedStudioBilling` writes the DEFAULT catalog if a plan/pack is missing — it
// is additive/idempotent so a redeploy never clobbers an admin's edits. The
// hybrid model: subscription tiers grant included AI Shoots; credit packs cover
// overage. The "AI Shoot" is the business unit (GPU/token internals hidden).
// ─────────────────────────────────────────────

export const DEFAULT_PLANS = [
  { code: "TRY", name: "Try", priceMonthly: 49, includedShoots: 2, maxResolution: "2K", overageCreditPrice: 25, sortOrder: 1 },
  { code: "BOUTIQUE", name: "Boutique", priceMonthly: 199, includedShoots: 10, maxResolution: "2K", overageCreditPrice: 20, sortOrder: 2 },
  { code: "PROFESSIONAL", name: "Professional", priceMonthly: 499, includedShoots: 30, maxResolution: "4K", overageCreditPrice: 16, sortOrder: 3 },
  { code: "BRAND", name: "Brand", priceMonthly: 999, includedShoots: 75, maxResolution: "4K", overageCreditPrice: 14, sortOrder: 4 },
  { code: "ENTERPRISE", name: "Enterprise", priceMonthly: 2499, includedShoots: 250, maxResolution: "4K", overageCreditPrice: 12, sortOrder: 5 },
] as const;

export const DEFAULT_PACKAGES = [
  { code: "PACK_1", name: "1 Shoot", credits: 1, price: 25, sortOrder: 1 },
  { code: "PACK_10", name: "10 Shoots", credits: 10, price: 199, sortOrder: 2 },
  { code: "PACK_50", name: "50 Shoots", credits: 50, price: 799, sortOrder: 3 },
  { code: "PACK_100", name: "100 Shoots", credits: 100, price: 1399, sortOrder: 4 },
] as const;

/**
 * Seed the default plan/pack catalog if missing. Idempotent + additive — uses
 * `code` as the natural key and only CREATES absent rows (never overwrites an
 * admin's price/limit edits). Safe to call at app boot or from an admin action.
 */
export async function seedStudioBilling(): Promise<void> {
  await Promise.all([
    ...DEFAULT_PLANS.map((p) =>
      prisma.subscriptionPlan
        .upsert({
          where: { code: p.code },
          create: {
            code: p.code,
            name: p.name,
            priceMonthly: p.priceMonthly,
            priceAnnual: round2(money(p.priceMonthly).mul(10)), // ~2 months free annually
            includedShoots: p.includedShoots,
            maxResolution: p.maxResolution,
            overageCreditPrice: p.overageCreditPrice,
            sortOrder: p.sortOrder,
          },
          update: {}, // never clobber admin edits
        })
        .catch(() => undefined),
    ),
    ...DEFAULT_PACKAGES.map((p) =>
      prisma.creditPackage
        .upsert({
          where: { code: p.code },
          create: { code: p.code, name: p.name, credits: p.credits, price: p.price, sortOrder: p.sortOrder },
          update: {},
        })
        .catch(() => undefined),
    ),
  ]);
}

export type PlanView = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number | null;
  currency: string;
  includedShoots: number;
  maxResolution: string;
  overageCreditPrice: number | null;
  sortOrder: number;
  isActive: boolean;
};

export async function listPlans(opts: { activeOnly?: boolean } = {}): Promise<PlanView[]> {
  const plans = await prisma.subscriptionPlan
    .findMany({
      where: opts.activeOnly ? { isActive: true } : undefined,
      orderBy: { sortOrder: "asc" },
    })
    .catch(() => []);
  if (plans.length === 0 && opts.activeOnly !== false) {
    // Lazily seed on first read so the UI is never empty pre-seed.
    await seedStudioBilling();
    return listPlansNoSeed(opts);
  }
  return plans.map(toPlanView);
}

async function listPlansNoSeed(opts: { activeOnly?: boolean }): Promise<PlanView[]> {
  const plans = await prisma.subscriptionPlan
    .findMany({ where: opts.activeOnly ? { isActive: true } : undefined, orderBy: { sortOrder: "asc" } })
    .catch(() => []);
  return plans.map(toPlanView);
}

function toPlanView(p: {
  id: string; code: string; name: string; priceMonthly: Prisma.Decimal; priceAnnual: Prisma.Decimal | null;
  currency: string; includedShoots: number; maxResolution: string; overageCreditPrice: Prisma.Decimal | null;
  sortOrder: number; isActive: boolean;
}): PlanView {
  return {
    id: p.id, code: p.code, name: p.name,
    priceMonthly: Number(p.priceMonthly),
    priceAnnual: p.priceAnnual == null ? null : Number(p.priceAnnual),
    currency: p.currency, includedShoots: p.includedShoots, maxResolution: p.maxResolution,
    overageCreditPrice: p.overageCreditPrice == null ? null : Number(p.overageCreditPrice),
    sortOrder: p.sortOrder, isActive: p.isActive,
  };
}

export type PackageView = {
  id: string; code: string; name: string; credits: number; price: number; currency: string; isActive: boolean; sortOrder: number;
};

export async function listPackages(opts: { activeOnly?: boolean } = {}): Promise<PackageView[]> {
  let packs = await prisma.creditPackage
    .findMany({ where: opts.activeOnly ? { isActive: true } : undefined, orderBy: { sortOrder: "asc" } })
    .catch(() => []);
  if (packs.length === 0) {
    await seedStudioBilling();
    packs = await prisma.creditPackage
      .findMany({ where: opts.activeOnly ? { isActive: true } : undefined, orderBy: { sortOrder: "asc" } })
      .catch(() => []);
  }
  return packs.map((p) => ({
    id: p.id, code: p.code, name: p.name, credits: p.credits, price: Number(p.price), currency: p.currency, isActive: p.isActive, sortOrder: p.sortOrder,
  }));
}

// ───────── Subscription state + entitlements ─────────

export type SubscriptionView = {
  planCode: string;
  planName: string;
  status: StudioSubscriptionStatus;
  billingCycle: StudioBillingCycle;
  currentPeriodEnd: Date;
  includedShoots: number;
  expired: boolean; // period has elapsed → entitlements lapse until renewal
} | null;

/** A vendor's current subscription + whether it has lapsed (expiry changes entitlements). */
export async function getSubscription(vendorId: string): Promise<SubscriptionView> {
  const sub = await prisma.studioSubscription
    .findUnique({ where: { vendorId }, select: { status: true, billingCycle: true, currentPeriodEnd: true, plan: { select: { code: true, name: true, includedShoots: true } } } })
    .catch(() => null);
  if (!sub) return null;
  const expired = sub.currentPeriodEnd.getTime() < Date.now() || sub.status === "CANCELLED" || sub.status === "EXPIRED";
  return {
    planCode: sub.plan.code,
    planName: sub.plan.name,
    status: sub.status,
    billingCycle: sub.billingCycle,
    currentPeriodEnd: sub.currentPeriodEnd,
    includedShoots: sub.plan.includedShoots,
    expired,
  };
}

/**
 * Activate (or renew/switch) a subscription inside a tx and GRANT the plan's
 * included shoots. Idempotent grant keyed on the payment id so a duplicate
 * webhook can't double-grant. Called from the billing reconciler on capture.
 */
export async function activateSubscription(params: {
  vendorId: string;
  planId: string;
  billingCycle: StudioBillingCycle;
  paymentId: string;
  includedShoots: number;
  planCode: string;
}): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now);
  if (params.billingCycle === "ANNUAL") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.studioSubscription.upsert({
    where: { vendorId: params.vendorId },
    create: {
      vendorId: params.vendorId,
      planId: params.planId,
      status: "ACTIVE",
      billingCycle: params.billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      planId: params.planId,
      status: "ACTIVE",
      billingCycle: params.billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  await grantCredit({
    vendorId: params.vendorId,
    shoots: params.includedShoots,
    type: "GRANT",
    idempotencyKey: `sub-grant:${params.paymentId}`,
    paymentId: params.paymentId,
    reason: `${params.planCode} plan — ${params.includedShoots} included shoots`,
    actor: "webhook",
  });
}

// ───────── Cost capture (§17) ─────────

// Representative Simulated per-op costs (USD), from the ADR §9 cost model — so
// the admin dashboard shows real-shaped numbers without real provider calls.
export const SIM_COST = {
  analyze: 0.02,
  tryon: 0.075,
  perImage: 0.05,
  videoPerSec: 0.08,
  perFidelity: 0.015,
  perModeration: 0.002,
  storagePerShoot: 0.02,
} as const;

/**
 * Record the real variable cost of a completed shoot (one row per session) +
 * the allocated seller revenue, so the admin margin engine can compute
 * contribution + margin%. Idempotent on sessionId (@unique).
 */
export async function recordGenerationCost(params: {
  sessionId: string;
  vendorId: string;
  planCode: string | null;
  provider: string;
  model: string;
  images: number;
  retries: number;
  videoSeconds: number;
  resolution: string | null;
  sellerRevenue: number | null;
}): Promise<void> {
  const gpu = round2Usd(
    SIM_COST.analyze +
      SIM_COST.tryon +
      params.images * SIM_COST.perImage +
      params.retries * SIM_COST.perImage +
      params.videoSeconds * SIM_COST.videoPerSec,
  );
  const qa = round2Usd((params.images + 1) * SIM_COST.perFidelity);
  const moderation = round2Usd((params.images + 1) * SIM_COST.perModeration);
  const storage = SIM_COST.storagePerShoot;
  const total = gpu + qa + moderation + storage;

  await prisma.generationCost
    .upsert({
      where: { sessionId: params.sessionId },
      create: {
        sessionId: params.sessionId,
        vendorId: params.vendorId,
        planCode: params.planCode,
        provider: params.provider,
        model: params.model,
        images: params.images,
        retries: params.retries,
        videoSeconds: params.videoSeconds,
        resolution: params.resolution,
        gpuCost: gpu,
        qaCost: qa,
        moderationCost: moderation,
        storageCost: storage,
        totalVariableCost: total,
        sellerRevenue: params.sellerRevenue,
      },
      update: {}, // idempotent — never double-count a replayed pipeline
    })
    .catch(() => undefined);
}

function round2Usd(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ───────── Admin margin aggregation (§25) ─────────

export type StudioMetrics = {
  revenue: Money; // allocated seller revenue for shoots in-period
  variableCost: Money; // Σ totalVariableCost (USD) → shown as-is (cost basis)
  grossContribution: Money;
  grossMarginPct: number;
  mrr: Money; // monthly recurring revenue from ACTIVE subscriptions
  subscribers: number;
  shootsConsumed: number;
  shootsRemaining: number; // Σ wallet.available across vendors
  shootsReserved: number;
  packRevenue: Money; // captured credit-pack payments in-period
  subscriptionRevenue: Money; // captured subscription payments in-period
  generationTotal: number;
  generationCompleted: number;
  generationFailed: number;
  generationReview: number;
  successRatePct: number;
  reviewQueue: number; // REVIEW_REQUIRED sessions
};

/** Platform AI-Studio KPIs over a trailing window (days). Admin-only caller. */
export async function getStudioMetrics(days: number): Promise<StudioMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [costs, subs, wallets, payments, sessions] = await Promise.all([
    prisma.generationCost.findMany({ where: { createdAt: { gte: since } }, select: { totalVariableCost: true, sellerRevenue: true } }),
    prisma.studioSubscription.findMany({ where: { status: "ACTIVE" }, select: { billingCycle: true, plan: { select: { priceMonthly: true, priceAnnual: true } } } }),
    prisma.creditWallet.findMany({ select: { available: true, reserved: true } }),
    prisma.studioPayment.findMany({ where: { status: "CAPTURED", createdAt: { gte: since } }, select: { kind: true, amount: true } }),
    prisma.generationSession.findMany({ where: { createdAt: { gte: since } }, select: { status: true } }),
  ]);

  const revenue = costs.reduce((s, c) => s.plus(money(c.sellerRevenue ?? 0)), money(0));
  const variableCost = costs.reduce((s, c) => s.plus(money(c.totalVariableCost)), money(0));
  const grossContribution = round2(revenue.minus(variableCost));
  const grossMarginPct = revenue.gt(0) ? Number(grossContribution.div(revenue).mul(100).toFixed(1)) : 0;

  const mrr = subs.reduce((s, sub) => {
    const monthly = sub.billingCycle === "ANNUAL" && sub.plan.priceAnnual != null
      ? money(sub.plan.priceAnnual).div(12)
      : money(sub.plan.priceMonthly);
    return s.plus(monthly);
  }, money(0));

  const shootsRemaining = wallets.reduce((s, w) => s.plus(money(w.available)), money(0));
  const shootsReserved = wallets.reduce((s, w) => s.plus(money(w.reserved)), money(0));
  const shootsConsumed = costs.length; // one cost row ≈ one delivered shoot

  const packRevenue = payments.filter((p) => p.kind === "CREDIT_PACK").reduce((s, p) => s.plus(money(p.amount)), money(0));
  const subscriptionRevenue = payments.filter((p) => p.kind === "SUBSCRIPTION").reduce((s, p) => s.plus(money(p.amount)), money(0));

  const generationTotal = sessions.length;
  const generationCompleted = sessions.filter((s) => s.status === "PREVIEW" || s.status === "APPROVED" || s.status === "PUBLISHED").length;
  const generationFailed = sessions.filter((s) => s.status === "FAILED").length;
  const generationReview = sessions.filter((s) => s.status === "REVIEW_REQUIRED").length;
  const finished = generationCompleted + generationFailed + generationReview;
  const successRatePct = finished > 0 ? Number(((generationCompleted / finished) * 100).toFixed(1)) : 0;

  return {
    revenue: round2(revenue),
    variableCost: round2(variableCost),
    grossContribution,
    grossMarginPct,
    mrr: round2(mrr),
    subscribers: subs.length,
    shootsConsumed,
    shootsRemaining: Number(shootsRemaining),
    shootsReserved: Number(shootsReserved),
    packRevenue: round2(packRevenue),
    subscriptionRevenue: round2(subscriptionRevenue),
    generationTotal,
    generationCompleted,
    generationFailed,
    generationReview,
    successRatePct,
    reviewQueue: generationReview,
  };
}

/** Daily generation volume buckets for the admin line chart. */
export async function getDailyGenerationVolume(days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const sessions = await prisma.generationSession
    .findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })
    .catch(() => []);
  const buckets = new Array<number>(days).fill(0);
  for (const s of sessions) {
    const idx = Math.floor((s.createdAt.getTime() - since.getTime()) / (24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

/** Top vendors by shoots consumed in-period (admin dashboard). */
export async function getTopVendorsByConsumption(days: number, limit = 5): Promise<{ vendorId: string; storeName: string; shoots: number }[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await prisma.generationCost
    .groupBy({ by: ["vendorId"], where: { createdAt: { gte: since } }, _count: { _all: true } })
    .catch(() => [] as { vendorId: string; _count: { _all: number } }[]);
  const sorted = grouped.sort((a, b) => b._count._all - a._count._all).slice(0, limit);
  const vendors = await prisma.vendor
    .findMany({ where: { id: { in: sorted.map((g) => g.vendorId) } }, select: { id: true, storeName: true } })
    .catch(() => []);
  const nameOf = new Map(vendors.map((v) => [v.id, v.storeName]));
  return sorted.map((g) => ({ vendorId: g.vendorId, storeName: nameOf.get(g.vendorId) ?? "Unknown", shoots: g._count._all }));
}

/** Subscription distribution by plan (admin dashboard bar chart). */
export async function getSubscriptionDistribution(): Promise<{ label: string; value: number }[]> {
  const subs = await prisma.studioSubscription
    .findMany({ where: { status: "ACTIVE" }, select: { plan: { select: { name: true } } } })
    .catch(() => []);
  const byPlan = new Map<string, number>();
  for (const s of subs) byPlan.set(s.plan.name, (byPlan.get(s.plan.name) ?? 0) + 1);
  return [...byPlan.entries()].map(([label, value]) => ({ label, value }));
}
