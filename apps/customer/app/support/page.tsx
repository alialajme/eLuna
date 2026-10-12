import Link from "next/link";
import { prisma } from "@ayvana/db";
import { CaseStatusBadge } from "@ayvana/ui";
import { safeCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function MyCasesPage() {
  const user = await safeCurrentUser();
  const cases = user
    ? await prisma.case
        .findMany({
          where: { openerUserId: user.id },
          orderBy: { createdAt: "desc" },
          include: { category: { select: { name: true } } },
        })
        .catch(() => [])
    : [];
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-display-sm text-ink">My cases</h1>
        <Link
          href="/support/new"
          className="rounded-md bg-ink px-3 py-1.5 text-label text-ivory"
        >
          New case
        </Link>
      </div>
      {!user && (
        <p className="text-body-sm text-mist">
          Sign in to view your cases or get help.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={`/support/${c.id}`}
            className="flex items-center gap-3 rounded-lg border border-sand bg-white p-3 hover:border-ink transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-body-sm text-ink truncate">{c.subject}</p>
              <p className="text-label text-mist">
                {c.caseNumber} · {c.category.name}
              </p>
            </div>
            <CaseStatusBadge status={c.status} />
          </Link>
        ))}
        {user && cases.length === 0 && (
          <p className="text-body-sm text-mist py-6 text-center">
            No cases yet.{" "}
            <Link className="underline" href="/support/new">
              Get help
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
