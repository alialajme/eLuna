"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AyvanaLogo, Icon } from "@ayvana/ui";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "grid", label: "Overview", href: "/" },
  { icon: "key", label: "Users & Access", href: "/users" },
  { icon: "store", label: "Vendors", href: "/sellers" },
  { icon: "spool", label: "Suppliers", href: "/suppliers" },
  { icon: "clipboard", label: "Orders", href: "/orders" },
  { icon: "bag", label: "Products", href: "/products" },
  { icon: "tag", label: "Categories", href: "/categories" },
  { icon: "banknote", label: "Payouts", href: "/payouts" },
  { icon: "wallet", label: "Supplier Payouts", href: "/supplier-payouts" },
  { icon: "percent", label: "Commissions", href: "/commissions" },
  { icon: "chart", label: "Analytics", href: "/analytics" },
  { icon: "sparkles", label: "AI Studio", href: "/ai-studio" },
  { icon: "users", label: "Customers", href: "/customers" },
  { icon: "alert", label: "Fraud", href: "/fraud" },
  { icon: "sliders", label: "Settings", href: "/settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink-elevated min-h-screen">
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
                          : href === "/ai-studio"
                          ? pathname === "/ai-studio" || pathname.startsWith("/ai-studio/")
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
              <Icon name={icon} className="shrink-0" />
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
