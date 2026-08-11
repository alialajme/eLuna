import { Metadata } from "next";
import { prisma } from "@e-luna/db";

export const metadata: Metadata = { title: "Users & Access — Luna Ops" };

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-sage/20 text-sage",
  VENDOR: "bg-gold/20 text-gold",
  SUPPLIER: "bg-gold/20 text-gold",
  CUSTOMER: "bg-sand text-mist",
};

// The platform's role capabilities — mirrors the per-app role gates + defense-in-depth
// action checks. Admin oversees everyone; each other role is scoped to its own data.
const CAPABILITIES: { label: string; customer: boolean; vendor: boolean; supplier: boolean; admin: boolean }[] = [
  { label: "Browse & buy abayas", customer: true, vendor: false, supplier: false, admin: false },
  { label: "Manage own profile, addresses & orders", customer: true, vendor: true, supplier: true, admin: true },
  { label: "List & manage products (own store)", customer: false, vendor: true, supplier: false, admin: false },
  { label: "Fulfil customer orders & shipments", customer: false, vendor: true, supplier: false, admin: false },
  { label: "Source materials from suppliers", customer: false, vendor: true, supplier: false, admin: false },
  { label: "List & manage materials (own catalog)", customer: false, vendor: false, supplier: true, admin: false },
  { label: "Fulfil vendor material orders", customer: false, vendor: false, supplier: true, admin: false },
  { label: "Approve / suspend vendors & suppliers", customer: false, vendor: false, supplier: false, admin: true },
  { label: "Moderate products, orders & fraud", customer: false, vendor: false, supplier: false, admin: true },
  { label: "Platform settings, payouts & commissions", customer: false, vendor: false, supplier: false, admin: true },
  { label: "Oversee all users & access (this page)", customer: false, vendor: false, supplier: false, admin: true },
];

const ROLE_ORDER = ["ADMIN", "VENDOR", "SUPPLIER", "CUSTOMER"] as const;

function Check({ on }: { on: boolean }) {
  return on
    ? <span className="text-sage">✓</span>
    : <span className="text-mist/40">—</span>;
}

export default async function UsersPage() {
  const users = await prisma.user
    .findMany({
      select: {
        id: true,
        email: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
        vendor: { select: { storeName: true } },
        supplier: { select: { companyName: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    })
    .catch(() => []);

  const counts = ROLE_ORDER.map((r) => ({ role: r, n: users.filter((u) => u.role === r).length }));

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="font-display text-display-md text-ink">Users &amp; Access</h2>
        <p className="text-body-sm text-mist">Every account on the platform, and what each role can do.</p>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {counts.map(({ role, n }) => (
          <div key={role} className="rounded-2xl border border-sand bg-white p-5">
            <p className="text-body-sm text-mist capitalize">{role.toLowerCase()}s</p>
            <p className="font-display text-display-md text-ink mt-1">{n}</p>
          </div>
        ))}
      </div>

      {/* Permissions matrix */}
      <section className="space-y-3">
        <h3 className="font-display text-display-sm text-ink">Role permissions</h3>
        <div className="overflow-x-auto rounded-2xl border border-sand bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-sand text-body-xs uppercase tracking-wide text-mist">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="px-4 py-3 text-center font-medium">Customer</th>
                <th className="px-4 py-3 text-center font-medium">Vendor</th>
                <th className="px-4 py-3 text-center font-medium">Supplier</th>
                <th className="px-4 py-3 text-center font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label} className="border-b border-sand/60 last:border-0">
                  <td className="px-4 py-3 text-body-sm text-ink">{c.label}</td>
                  <td className="px-4 py-3 text-center"><Check on={c.customer} /></td>
                  <td className="px-4 py-3 text-center"><Check on={c.vendor} /></td>
                  <td className="px-4 py-3 text-center"><Check on={c.supplier} /></td>
                  <td className="px-4 py-3 text-center"><Check on={c.admin} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-xs text-mist">
          Access is enforced per app (separate logins per persona) plus a defense-in-depth role check in every server action.
        </p>
      </section>

      {/* All users */}
      <section className="space-y-3">
        <h3 className="font-display text-display-sm text-ink">All accounts ({users.length})</h3>
        <div className="overflow-x-auto rounded-2xl border border-sand bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-sand text-body-xs uppercase tracking-wide text-mist">
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">MFA</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-body-sm text-ink">{u.vendor?.storeName ?? u.supplier?.companyName ?? u.email}</p>
                    {(u.vendor || u.supplier) && <p className="text-body-xs text-mist">{u.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-body-xs font-medium ${ROLE_BADGE[u.role] ?? "bg-sand text-mist"}`}>
                      {u.role.charAt(0) + u.role.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.mfaEnabled
                      ? <span className="text-body-xs text-sage">Enabled</span>
                      : <span className="text-body-xs text-mist">Off</span>}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-mist">
                    {u.createdAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
