import { redirect } from "next/navigation";
import { getCaseDetail } from "@ayvana/db";
import { CaseStatusBadge, CaseThread, type CaseThreadMessage } from "@ayvana/ui";
import { getAuthUser } from "@ayvana/auth";
import { CaseActions } from "../components/CaseActions";
import { CaseComposer } from "../components/CaseComposer";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) redirect("/");

  const { id } = await params;
  const c = await getCaseDetail(id).catch(() => null);
  if (!c) redirect("/cases");

  const messages: CaseThreadMessage[] = c.messages.map((m) => ({ id: m.id, authorRole: m.authorRole, body: m.body, isInternal: m.isInternal, createdAt: m.createdAt }));
  const overdue = c.resolutionDueAt && !c.resolvedAt && c.resolutionDueAt.getTime() < Date.now();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-display-sm text-ink">{c.subject}</h2>
        <CaseStatusBadge status={c.status} />
        {overdue && <span className="rounded-md bg-coral/20 px-2 py-0.5 text-label text-coral">overdue</span>}
      </div>
      <div className="rounded-md border border-sand bg-white p-4 text-label text-mist">
        <p>{c.caseNumber} · {c.category.name} · {c.channel.toLowerCase()} · {c.priority.toLowerCase()} · {c.type.toLowerCase()}</p>
        <p>Opener: {c.contactName}{c.contactEmail ? ` · ${c.contactEmail}` : ""}{c.contactPhone ? ` · ${c.contactPhone}` : ""}</p>
        {c.orderId && <p>Order: {c.orderId}</p>}
        {c.relatedReturnId && <p>Linked return: {c.relatedReturnId}</p>}
        <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink">{c.description}</p>
      </div>

      <CaseActions caseId={c.id} status={c.status} />
      <CaseThread messages={messages} showInternal />
      <CaseComposer caseId={c.id} />
    </div>
  );
}
