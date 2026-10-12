import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, listCases, type CaseStatus } from "@ayvana/db";
import { CaseStatusBadge } from "@ayvana/ui";
import { getAuthUser } from "@ayvana/auth";
import { StatusFilter } from "../components/StatusFilter";

export const dynamic = "force-dynamic";

const STATUSES: CaseStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "CANCELLED"];
const FILTERS = [{ label: "All", value: "all" }, ...STATUSES.map((s) => ({ label: s.replace(/_/g, " "), value: s }))];

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getAuthUser();
  if (!user || !["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const status = STATUSES.includes(raw as CaseStatus) ? (raw as CaseStatus) : undefined;
  const cases = await listCases({ status }).catch(() => []);
  void prisma; // listCases encapsulates the query

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="text-display-sm text-ink">Cases</h2>
      <StatusFilter status={raw} options={FILTERS} />
      <div className="flex flex-col gap-2">
        {cases.length === 0 && <p className="text-body-sm text-mist">No cases.</p>}
        {cases.map((c) => (
          <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 hover:border-ink">
            <div className="flex-1">
              <p className="text-body-sm font-medium text-ink">{c.subject}</p>
              <p className="text-label text-mist">{c.caseNumber} · {c.category.name} · {c.channel.toLowerCase()} · {c.priority.toLowerCase()}</p>
            </div>
            <CaseStatusBadge status={c.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
