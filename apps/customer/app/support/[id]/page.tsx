import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge, CaseThread, type CaseThreadMessage } from "@ayvana/ui";
import { safeCurrentUser } from "../../lib/auth";
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
  const c = await prisma.case
    .findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    .catch(() => null);
  // redirect if not found, or if the case belongs to a different signed-in user
  if (!c || (user && c.openerUserId && c.openerUserId !== user.id))
    redirect("/support");

  const messages: CaseThreadMessage[] = c.messages.map((m) => ({
    id: m.id,
    authorRole: m.authorRole,
    body: m.body,
    isInternal: m.isInternal,
    createdAt: m.createdAt,
  }));

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-display-sm text-ink">{c.subject}</h1>
        <CaseStatusBadge status={c.status} />
      </div>
      <p className="mb-4 text-label text-mist">{c.caseNumber}</p>
      <CaseThread messages={messages} />
      <div className="mt-4">
        <OwnCaseComposer caseId={c.id} action={replyToOwnCase} />
      </div>
    </main>
  );
}
