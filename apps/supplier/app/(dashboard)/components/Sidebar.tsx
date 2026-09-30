"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AyvanaLogo, Icon } from "@ayvana/ui";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "grid", label: "Dashboard", href: "/" },
  { icon: "spool", label: "Materials", href: "/materials" },
  { icon: "inbox", label: "Incoming Orders", href: "/orders" },
  { icon: "package", label: "Customer Orders", href: "/fulfilment" },
  { icon: "undo", label: "Returns", href: "/returns" },
  { icon: "receipt", label: "Invoices", href: "/invoices" },
  { icon: "banknote", label: "Payouts", href: "/payouts" },
  { icon: "chart", label: "Analytics", href: "/analytics" },
  { icon: "sliders", label: "Settings", href: "/settings" },
] as const;

type Props = {
  companyName: string;
};

export function Sidebar({ companyName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      <div className="px-4 py-5 border-b border-white/10">
        <AyvanaLogo tone="onDark" subtitle="Supplier OS" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive ? "bg-gold/20 text-gold" : "text-mist hover:text-ivory hover:bg-white/5"
              }`}
            >
              <Icon name={icon} className="shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-2">
        <p className="text-body-xs text-gold truncate">{companyName}</p>
        <SignOutButton>
          <button className="text-body-xs text-mist hover:text-ivory transition-colors">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
