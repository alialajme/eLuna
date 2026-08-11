import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { TrnForm } from "../components/TrnForm";

export const metadata: Metadata = { title: "Settings — Luna Supplier" };

const ftaConfigured = !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;

export default async function SettingsPage() {
  const user = await safeCurrentUser();
  if (!user) return null;
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null;

  const record = await prisma.supplier
    .findUnique({ where: { id: supplier.id }, select: { trn: true } })
    .catch(() => null);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-display text-display-md text-ink">Settings</h2>

      <section className="rounded-2xl border border-sand bg-ivory p-6 space-y-4">
        <div>
          <h3 className="font-display text-display-sm text-ink">Tax &amp; E-invoicing</h3>
          <p className="text-body-sm text-mist">Your TRN appears on every tax invoice you issue.</p>
        </div>
        <TrnForm initialTrn={record?.trn ?? null} />
        <div className="border-t border-sand pt-4">
          <p className="text-label text-mist mb-1">E-INVOICING STATUS</p>
          {ftaConfigured ? (
            <span className="rounded-full bg-sage/20 px-3 py-1 text-body-sm font-medium text-sage">Connected (FTA)</span>
          ) : (
            <span className="rounded-full bg-sand px-3 py-1 text-body-sm font-medium text-mist">Simulated (local)</span>
          )}
          <p className="text-body-xs text-mist mt-2">
            Invoices are issued locally. Connect a UAE FTA / Peppol Access Point to transmit them to the tax authority.
          </p>
        </div>
      </section>
    </div>
  );
}
