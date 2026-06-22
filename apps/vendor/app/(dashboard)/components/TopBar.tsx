"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/products": "Products",
  "/orders": "Orders",
  "/inventory": "Inventory",
  "/analytics": "Analytics",
  "/payouts": "Payouts",
  "/settings": "Settings",
};

type Props = {
  storeName: string;
};

export function TopBar({ storeName }: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Vendor OS";

  return (
    <header className="flex h-14 items-center justify-between border-b border-sand bg-ivory px-6">
      <h1 className="font-display text-display-sm text-ink">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-sand px-3 py-1 text-body-sm text-ink">
          {storeName}
        </span>
      </div>
    </header>
  );
}
