import { Metadata } from "next";
import Link from "next/link";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";
import { prisma } from "@e-luna/db";

export const metadata: Metadata = {
  title: "Dashboard — Luna Supplier",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await safeCurrentUser();
  if (!user) return null; // Layout handles the sign-in redirect

  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null; // Layout handles the onboarding redirect

  const materialCount = await prisma.material
    .count({ where: { supplierId: supplier.id } })
    .catch(() => 0);

  const today = new Date().toLocaleDateString("en-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display text-display-md text-ink">
          {getGreeting()}, {supplier.companyName} ✦
        </h2>
        <p className="text-body-md text-mist">{today}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/materials"
          className="rounded-2xl border border-sand bg-ivory p-6 hover:border-ink transition-colors"
        >
          <p className="text-label text-gold mb-1">CATALOG</p>
          <p className="text-body-md font-medium text-ink">Materials</p>
          <p className="text-body-sm text-mist mt-1">
            {materialCount === 0
              ? "Add fabrics, trims, and hardware with wholesale pricing."
              : `${materialCount} material${materialCount === 1 ? "" : "s"} listed. Manage your catalog →`}
          </p>
        </Link>
        <div className="rounded-2xl border border-dashed border-sand bg-ivory p-6">
          <p className="text-label text-gold mb-1">COMING SOON</p>
          <p className="text-body-md font-medium text-ink">Incoming orders</p>
          <p className="text-body-sm text-mist mt-1">
            Receive and fulfil material orders placed by Luna vendors.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-6">
        <p className="text-body-sm font-medium text-ink mb-2">Your supply categories</p>
        <div className="flex flex-wrap gap-2">
          {supplier.materialTypes.length === 0 ? (
            <span className="text-body-sm text-mist">None selected</span>
          ) : (
            supplier.materialTypes.map((t) => (
              <span
                key={t}
                className="rounded-full border border-sand px-3 py-1 text-body-sm text-ink capitalize"
              >
                {t}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
