import { cookies } from "next/headers";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

type CartItem = { variantId: string; qty: number };

function getCartCount(): number {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get("luna_cart")?.value;
    if (!raw) return 0;
    const items: CartItem[] = JSON.parse(raw);
    return items.reduce((sum, item) => sum + item.qty, 0);
  } catch {
    return 0;
  }
}

export function Nav() {
  const cartCount = getCartCount();

  return (
    <header className="sticky top-0 z-30 border-b border-sand bg-ivory/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="font-display text-display-md font-bold tracking-widest text-ink">
          LUNA
        </Link>

        {/* Centre links — hidden on mobile */}
        <div className="hidden items-center gap-8 md:flex">
          <Link href="/browse" className="text-body-md text-ink hover:text-gold transition-colors">
            Browse
          </Link>
          <Link href="/browse?sort=newest" className="text-body-md text-ink hover:text-gold transition-colors">
            New Arrivals
          </Link>
          <Link href="/browse?sort=rating" className="text-body-md text-ink hover:text-gold transition-colors">
            Boutiques
          </Link>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-4">
          <Link href="/browse?q=" aria-label="Search" className="text-ink hover:text-gold transition-colors">
            <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </Link>

          <SignedIn>
            <Link href="/wishlist" aria-label="Wishlist" className="text-ink hover:text-gold transition-colors">
              <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>

            <Link href="/cart" aria-label="Cart" className="relative text-ink hover:text-gold transition-colors">
              <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-label font-bold text-ink">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>

            <UserButton afterSignOutUrl="/" />
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal" asChild>
              <button type="button" className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </nav>
    </header>
  );
}
