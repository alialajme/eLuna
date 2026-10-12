import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { CaseSubmitForm } from "@ayvana/ui";
import { safeCurrentUser } from "../../lib/auth";
import { submitCustomerCase } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  // Authenticated-only web intake (WhatsApp is the anonymous channel).
  const user = await safeCurrentUser();
  if (!user) redirect("/support");
  const categories = await prisma.caseCategory
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    })
    .catch(() => []);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-4 text-display-sm text-ink">Get help</h1>
      <CaseSubmitForm categories={categories} action={submitCustomerCase} />
    </main>
  );
}
