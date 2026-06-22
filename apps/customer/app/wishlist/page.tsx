import Link from "next/link";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { ProductCard } from "@e-luna/ui";
import { toggleWishlist } from "../actions/wishlist";

export const metadata: Metadata = {
  title: "Wishlist — Luna",
};

export default async function WishlistPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to see your wishlist</p>
        <a
          href="/sign-in"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Sign in
        </a>
      </div>
    );
  }

  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  }).catch(() => null);

  const wishlists = profile
    ? await prisma.wishlist.findMany({
        where: { customerProfileId: profile.id },
        include: {
          product: {
            include: { vendor: { select: { storeName: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }).catch(() => [])
    : [];

  if (wishlists.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-2">Nothing saved yet</p>
        <p className="text-body-md text-mist mb-6">Browse and tap ♡ to save abayas you love</p>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Browse abayas
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <h1 className="font-display text-display-lg text-ink mb-8">
        Saved ({wishlists.length})
      </h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {wishlists.map(({ product }) => {
          const images = Array.isArray(product.aiImages) ? product.aiImages as string[] : [];
          return (
            <Link key={product.id} href={`/p/${product.slug}`} className="block">
              <ProductCard
                id={product.id}
                title={product.title}
                price={Number(product.price)}
                imageUrl={images[0] ?? undefined}
                vendorName={product.vendor.storeName}
                isWishlisted={true}
                onWishlistToggle={async (id: string) => {
                  "use server";
                  await toggleWishlist(id);
                }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
