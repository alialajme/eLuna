import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge, CaseThread, type CaseThreadMessage } from "@ayvana/ui";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { replyToOwnCase } from "../_shared-thread";
import { OwnCaseComposer } from "../_composer";

export const dynamic = "force-dynamic";

export default async function CaseThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const c = await prisma.case
    .findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    .catch(() => null);
  // ownership: case must belong to this vendor
  if (!c || c.vendorId !== vendor.id) redirect("/support");

  const messages: CaseThreadMessage[] = c.messages.map((m) => ({
    id: m.id,
    authorRole: m.authorRole,
    body: m.body,
    isInternal: m.isInternal,
    createdAt: m.createdAt,
  }));

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-display-sm text-ink">{c.subject}</h2>
        <CaseStatusBadge status={c.status} />
      </div>
      <p className="text-label text-mist">{c.caseNumber}</p>
      <CaseThread messages={messages} />
      <OwnCaseComposer caseId={c.id} action={replyToOwnCase} />
    </div>
  );
}
