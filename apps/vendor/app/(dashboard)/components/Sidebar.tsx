"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "📦", label: "Products", href: "/products" },
  { icon: "📋", label: "Orders", href: "/orders" },
  { icon: "🏭", label: "Inventory", href: "/inventory" },
  { icon: "📈", label: "Analytics", href: "/analytics" },
  { icon: "💸", label: "Payouts", href: "/payouts" },
  { icon: "⚙️", label: "Settings", href: "/settings" },
] as const;

type Props = {
  storeName: string;
};

export function Sidebar({ storeName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-display text-display-sm text-gold">✦ Luna</p>
        <p className="text-body-xs text-mist mt-0.5">Vendor OS</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive
                  ? "bg-gold/20 text-gold"
                  : "text-mist hover:text-ivory hover:bg-white/5"
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10 space-y-2">
        <p className="text-body-xs text-gold truncate">{storeName}</p>
        <SignOutButton>
          <button className="text-body-xs text-mist hover:text-ivory transition-colors">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
