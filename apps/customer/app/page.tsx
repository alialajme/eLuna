import Link from "next/link";
import { prisma } from "@e-luna/db";
import { ProductCard } from "@e-luna/ui";
import { safeCurrentUser as currentUser } from "./lib/auth";

const CATEGORIES = [
  { label: "Occasion", slug: "Occasion", emoji: "✦" },
  { label: "Everyday", slug: "Everyday", emoji: "◌" },
  { label: "Travel", slug: "Travel", emoji: "◎" },
  { label: "Sport", slug: "Sport", emoji: "◈" },
];

const HERO_CAMPAIGN = {
  label: "New Season",
  heading: "Ramadan\nEvenings",
  cta: "SHOP NOW",
  href: "/browse?category=Occasion",
};

export default async function HomePage() {
  const user = await currentUser();

  const [categoryStats, newArrivals, featuredBoutiques, sizeProfileStatus] = await Promise.all([
    prisma.product.groupBy({
      by: ["category"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),

    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { vendor: { select: { storeName: true } } },
    }),

    prisma.vendor.findMany({
      where: { status: "ACTIVE" },
      take: 3,
      include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } },
    }),

    user
      ? prisma.sizeProfile.findFirst({
          where: { customerProfile: { userId: user.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const countMap = Object.fromEntries(categoryStats.map((c) => [c.category, c._count._all]));
  const categoryCounts = CATEGORIES.map((cat) => ({ ...cat, count: countMap[cat.slug] ?? 0 }));

  const hasSizeProfile = !!sizeProfileStatus;

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative flex min-h-[70vh] items-end bg-ink px-6 pb-16 pt-8">
        <div className="relative z-10 max-w-xl">
          <p className="text-label uppercase tracking-widest text-gold mb-4">
            {HERO_CAMPAIGN.label}
          </p>
          <h1 className="font-display text-display-xl text-ivory whitespace-pre-line mb-8">
            {HERO_CAMPAIGN.heading}
          </h1>
          <Link
            href={HERO_CAMPAIGN.href}
            className="inline-block bg-gold px-8 py-3 text-label uppercase tracking-widest text-ink hover:bg-gold/90 transition-colors"
          >
            {HERO_CAMPAIGN.cta}
          </Link>
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <h2 className="font-display text-display-md text-ink mb-6">Shop by Style</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categoryCounts.map((cat) => (
            <Link
              key={cat.slug}
              href={`/browse?category=${cat.slug}`}
              className="group flex flex-col items-center justify-center rounded-2xl bg-sand p-8 text-center hover:bg-gold/20 transition-colors"
            >
              <span className="text-2xl text-gold mb-2">{cat.emoji}</span>
              <span className="font-sans text-body-lg font-semibold text-ink">{cat.label}</span>
              <span className="text-body-sm text-mist mt-1">{cat.count} abayas</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── New Arrivals ───────────────────────────────────────── */}
      {newArrivals.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-display-md text-ink">New Arrivals</h2>
            <Link href="/browse?sort=newest" className="text-body-md text-gold hover:underline">
              View all
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
            {newArrivals.map((product) => {
              const firstImage = Array.isArray(product.aiImages) && typeof product.aiImages[0] === "string"
                ? product.aiImages[0]
                : null;
              return (
                <Link
                  key={product.id}
                  href={`/p/${product.slug}`}
                  className="shrink-0 w-48 md:w-56"
                >
                  <ProductCard
                    id={product.id}
                    title={product.title}
                    price={Number(product.price)}
                    imageUrl={firstImage}
                    vendorName={product.vendor.storeName}
                  />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Featured Boutiques ─────────────────────────────────── */}
      {featuredBoutiques.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <h2 className="font-display text-display-md text-ink mb-6">Featured Boutiques</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {featuredBoutiques.map((vendor) => (
              <Link
                key={vendor.id}
                href={`/vendors/${vendor.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-sand bg-ivory p-5 hover:border-gold transition-colors"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sand text-display-md font-bold text-ink group-hover:bg-gold/20 transition-colors">
                  {vendor.storeName?.[0] ?? "○"}
                </div>
                <div>
                  <p className="font-sans text-body-lg font-semibold text-ink">{vendor.storeName}</p>
                  <p className="text-body-sm text-mist">
                    {vendor._count.products} abayas
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── AI Stylist Banner ──────────────────────────────────── */}
      {user && (
        <section className="bg-ink mx-4 my-8 rounded-2xl px-8 py-10 md:mx-6">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-label uppercase tracking-widest text-gold mb-2">Luna AI Stylist</p>
              {hasSizeProfile ? (
                <h2 className="font-display text-display-md text-ivory">Your style, saved.</h2>
              ) : (
                <h2 className="font-display text-display-md text-ivory">
                  Luna knows your size.
                  <br />
                  Ask her anything.
                </h2>
              )}
            </div>
            <Link
              href="/chat"
              className="shrink-0 flex items-center gap-2 rounded-full border border-gold px-6 py-3 text-body-md font-medium text-gold hover:bg-gold hover:text-ink transition-colors"
            >
              <span>◑</span> Chat with Luna →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
