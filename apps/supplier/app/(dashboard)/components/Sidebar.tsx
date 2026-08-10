"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
] as const;

const SOON_ITEMS = [
  { icon: "🧵", label: "Materials" },
  { icon: "📋", label: "Incoming Orders" },
] as const;

type Props = {
  companyName: string;
};

export function Sidebar({ companyName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-display text-display-sm text-gold">✦ Luna</p>
        <p className="text-body-xs text-mist mt-0.5">Supplier OS</p>
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
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
        {SOON_ITEMS.map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-body-md text-mist/50"
          >
            <span className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </span>
            <span className="text-body-xs text-mist/40">soon</span>
          </div>
        ))}
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
