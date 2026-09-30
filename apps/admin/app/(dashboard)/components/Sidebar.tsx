"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AyvanaLogo } from "@ayvana/ui";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Overview", href: "/" },
  { icon: "🔑", label: "Users & Access", href: "/users" },
  { icon: "🏬", label: "Vendors", href: "/sellers" },
  { icon: "🧵", label: "Suppliers", href: "/suppliers" },
  { icon: "📋", label: "Orders", href: "/orders" },
  { icon: "🛍️", label: "Products", href: "/products" },
  { icon: "🏷️", label: "Categories", href: "/categories" },
  { icon: "💸", label: "Payouts", href: "/payouts" },
  { icon: "🧶", label: "Supplier Payouts", href: "/supplier-payouts" },
  { icon: "⚖️", label: "Commissions", href: "/commissions" },
  { icon: "📈", label: "Analytics", href: "/analytics" },
  { icon: "👥", label: "Customers", href: "/customers" },
  { icon: "🛡️", label: "Fraud", href: "/fraud" },
  { icon: "⚙️", label: "Settings", href: "/settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <AyvanaLogo tone="onDark" subtitle="Ops Console" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : href === "/sellers"
                ? pathname === "/sellers" || pathname.startsWith("/sellers/")
                : href === "/suppliers"
                ? pathname === "/suppliers" || pathname.startsWith("/suppliers/")
                : href === "/orders"
                  ? pathname === "/orders" || pathname.startsWith("/orders/")
                  : href === "/products"
                    ? pathname === "/products"
                    : href === "/payouts"
                      ? pathname === "/payouts"
                      : href === "/commissions"
                        ? pathname === "/commissions"
                        : href === "/analytics"
                          ? pathname === "/analytics"
                          : href === "/customers"
                            ? pathname === "/customers" || pathname.startsWith("/customers/")
                            : href === "/fraud"
                              ? pathname === "/fraud"
                              : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive
                  ? "bg-sage/20 text-sage"
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
      <div className="px-4 py-4 border-t border-white/10">
        <SignOutButton>
          <button className="text-body-xs text-mist hover:text-ivory transition-colors">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
