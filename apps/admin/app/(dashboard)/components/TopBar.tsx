"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/sellers": "Sellers",
  "/sellers/approvals": "Pending Approvals",
  "/orders": "Orders",
  "/products": "Products",
  "/payouts": "Payouts",
  "/commissions": "Commissions",
};

export function TopBar() {
  const pathname = usePathname();
  const title =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/sellers/")
      ? "Seller Detail"
      : pathname.startsWith("/orders/")
        ? "Order Detail"
        : "Luna Ops");

  return (
    <header className="flex h-14 items-center justify-between border-b border-sand bg-ivory px-6">
      <h1 className="font-display text-display-sm text-ink">{title}</h1>
      <span className="rounded-full bg-sage/20 px-3 py-1 text-body-sm text-sage">
        Admin
      </span>
    </header>
  );
}
