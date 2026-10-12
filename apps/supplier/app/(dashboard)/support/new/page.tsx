import { prisma } from "@ayvana/db";
import { CaseSubmitForm } from "@ayvana/ui";
import { submitSupplierCase } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const categories = await prisma.caseCategory
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    })
    .catch(() => []);
  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-display-sm text-ink">Get help</h2>
      <CaseSubmitForm categories={categories} action={submitSupplierCase} />
    </div>
  );
}
