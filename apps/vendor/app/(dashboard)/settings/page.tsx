import { Metadata } from "next";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { ProfileForm } from "./components/ProfileForm";
import { IbanForm } from "./components/IbanForm";

export const metadata: Metadata = { title: "Settings — Luna Vendor" };

export default async function SettingsPage() {
  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  return (
    <div className="max-w-xl space-y-10">
      <h2 className="font-display text-display-md text-ink">Settings</h2>

      {/* Store Profile */}
      <section className="space-y-4">
        <div className="border-b border-sand pb-2">
          <h3 className="text-body-md font-medium text-ink">Store Profile</h3>
          <p className="text-body-sm text-mist">
            Visible to customers on your boutique page
          </p>
        </div>
        <ProfileForm
          storeName={vendor.storeName}
          description={vendor.description ?? ""}
          logoUrl={vendor.logoUrl ?? ""}
        />
      </section>

      {/* Payout Details */}
      <section className="space-y-4">
        <div className="border-b border-sand pb-2">
          <h3 className="text-body-md font-medium text-ink">Payout Details</h3>
          <p className="text-body-sm text-mist">
            Your IBAN for vendor payouts. Stored securely.
          </p>
        </div>
        <IbanForm currentIban={vendor.ibanNumber ?? ""} />
      </section>
    </div>
  );
}
