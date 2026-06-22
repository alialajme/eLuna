import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { deleteAddress, setDefaultAddress } from "../actions/address";

export const metadata: Metadata = {
  title: "My Profile — Luna",
};

export default async function ProfilePage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to view your profile</p>
        <a
          href="/sign-in"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Sign in
        </a>
      </div>
    );
  }

  const [addresses, profile] = await Promise.all([
    prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }).catch(() => []),
    prisma.customerProfile.findUnique({
      where: { userId: user.id },
      include: { sizeProfile: { select: { usualSize: true } } },
    }).catch(() => null),
  ]);

  const initials = (
    (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")
  ).toUpperCase() || "?";
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Guest";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 space-y-8">
      <section className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-display-sm text-ivory font-display">
          {initials}
        </div>
        <div>
          <p className="font-display text-display-sm text-ink">{fullName}</p>
          <p className="text-body-md text-mist">{user.emailAddresses[0]?.emailAddress}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-ivory p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-display-sm text-ink">Size Profile</h2>
          <Link href="/profile/size" className="text-body-sm text-gold hover:underline">
            {profile?.sizeProfile ? "Edit" : "Set up"}
          </Link>
        </div>
        {profile?.sizeProfile?.usualSize ? (
          <p className="text-body-md text-mist">
            Usual size:{" "}
            <span className="text-ink font-medium">{profile.sizeProfile.usualSize}</span>{" "}
            · Luna uses this to personalise recommendations
          </p>
        ) : (
          <p className="text-body-md text-mist">
            Add your measurements so Luna can recommend the perfect fit.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-display-sm text-ink">Address Book</h2>
        </div>

        {addresses.length === 0 ? (
          <p className="text-body-md text-mist">No addresses saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {addresses.map((addr) => (
              <li key={addr.id} className="rounded-xl border border-sand p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-body-md text-ink">
                    <p className="font-medium">
                      {addr.fullName}
                      {addr.label && (
                        <span className="ml-2 text-body-sm text-mist">({addr.label})</span>
                      )}
                      {addr.isDefault && (
                        <span className="ml-2 text-body-sm text-gold">✦ Default</span>
                      )}
                    </p>
                    <p className="text-mist">{addr.phone}</p>
                    <p>
                      {addr.addressLine1}
                      {addr.addressLine2 ? `, ${addr.addressLine2}` : ""}
                    </p>
                    <p>
                      {addr.city}
                      {addr.emirate ? `, ${addr.emirate}` : ""}, UAE
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 text-right">
                    {!addr.isDefault && (
                      <form action={async () => { await setDefaultAddress(addr.id); }}>
                        <button
                          type="submit"
                          className="text-body-sm text-mist hover:text-gold transition-colors"
                        >
                          Set default
                        </button>
                      </form>
                    )}
                    <form action={async () => { await deleteAddress(addr.id); }}>
                      <button
                        type="submit"
                        className="text-body-sm text-mist hover:text-coral transition-colors"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        {[
          { href: "/orders", label: "Order History" },
          { href: "/wishlist", label: "Saved Items" },
          { href: "/chat", label: "AI Stylist" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-sand px-4 py-3 text-body-md text-ink hover:border-gold hover:text-gold transition-colors text-center"
          >
            {label}
          </Link>
        ))}
      </section>
    </div>
  );
}
