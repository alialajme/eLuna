import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionForVendor } from "@ayvana/studio";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { ShootResults } from "./ShootResults";

export const metadata: Metadata = { title: "Your shoot — AYVANA Studio" };

export default async function StudioResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  // Ownership-checked read — a non-owner (or missing) returns null → notFound.
  const session = await getSessionForVendor(id, vendor.id);
  if (!session) notFound();

  return <ShootResults initial={{ ...session, createdAt: session.createdAt.toISOString() }} />;
}
