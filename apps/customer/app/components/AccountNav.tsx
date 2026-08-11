import Link from "next/link";

const ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/profile/size", label: "Size & Fit" },
  { href: "/orders", label: "Orders" },
  { href: "/wishlist", label: "Wishlist" },
];

export function AccountNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-sand pb-3">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="rounded-full border border-sand px-4 py-1.5 text-body-sm text-mist transition-colors hover:border-ink hover:text-ink"
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
