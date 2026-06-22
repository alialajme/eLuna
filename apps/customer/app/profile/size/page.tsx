import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { SizeProfileForm } from "./SizeProfileForm";

export const metadata: Metadata = {
  title: "Size Profile — Luna",
};

export default async function SizeProfilePage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-display-md text-ink mb-4">Sign in to set your size profile</p>
        <a
          href="/sign-in"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
        >
          Sign in
        </a>
      </div>
    );
  }

  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    include: { sizeProfile: true },
  }).catch(() => null);

  const sp = profile?.sizeProfile;
  const initial = {
    usualSize: sp?.usualSize ?? "",
    sizeSystem: sp?.sizeSystem ?? "INTL",
    height: sp?.height?.toString() ?? "",
    weight: sp?.weight?.toString() ?? "",
    bust: sp?.bust?.toString() ?? "",
    waist: sp?.waist?.toString() ?? "",
    hip: sp?.hip?.toString() ?? "",
    shoulder: sp?.shoulder?.toString() ?? "",
    sleeveLength: sp?.sleeveLength ?? "",
    preferredAbayaLength: sp?.preferredAbayaLength ?? "",
    fitPreference: sp?.fitPreference ?? "",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <nav className="mb-6 flex items-center gap-2 text-body-sm text-mist">
        <Link href="/profile" className="hover:text-gold transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-ink">Size Profile</span>
      </nav>
      <h1 className="font-display text-display-lg text-ink mb-2">Size Profile</h1>
      <p className="text-body-md text-mist mb-8">
        Luna uses your measurements to recommend your perfect fit.
      </p>
      <SizeProfileForm initial={initial} />
    </div>
  );
}
