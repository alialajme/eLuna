import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge } from "@ayvana/ui";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const dynamic = "force-dynamic";

export default async function MyCasesPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const cases = await prisma.case
    .findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      include: { category: { select: { name: true } } },
    })
    .catch(() => []);

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-display-sm text-ink">My cases</h2>
        <Link
          href="/support/new"
          className="rounded-md bg-ink px-3 py-1.5 text-label text-ivory"
        >
          New case
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {cases.length === 0 && (
          <p className="py-6 text-center text-body-sm text-mist">
            No cases yet.{" "}
            <Link className="underline" href="/support/new">
              Get help
            </Link>
            .
          </p>
        )}
        {cases.map((c) => (
          <Link
            key={c.id}
            href={`/support/${c.id}`}
            className="flex items-center gap-3 rounded-lg border border-sand bg-white p-3 transition-colors hover:border-ink"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm text-ink">{c.subject}</p>
              <p className="text-label text-mist">
                {c.caseNumber} · {c.category.name}
              </p>
            </div>
            <CaseStatusBadge status={c.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
