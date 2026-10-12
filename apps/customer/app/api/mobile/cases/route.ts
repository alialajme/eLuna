import { prisma, createCase } from "@ayvana/db";
import { resolveMobileCustomer } from "../_customer";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ cases: [] });
  const user = await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } });
  const cases = await prisma.case.findMany({
    where: { openerUserId: user?.userId },
    orderBy: { createdAt: "desc" },
    include: { category: { select: { name: true } } },
    take: 50,
  });
  return Response.json({ cases: cases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status, category: c.category.name, createdAt: c.createdAt })) });
}

export async function POST(req: Request) {
  const customer = await resolveMobileCustomer();
  const body = (await req.json().catch(() => null)) as { type?: string; categoryId?: string; subject?: string; description?: string; contactName?: string; contactEmail?: string } | null;
  if (!body?.categoryId || !body.subject?.trim() || !body.description?.trim()) {
    return Response.json({ error: "categoryId, subject and description are required" }, { status: 400 });
  }
  const user = customer ? await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } }) : null;
  const res = await createCase({
    type: (body.type as "COMPLAINT" | "SUGGESTION" | "QUESTION") ?? "COMPLAINT",
    categoryId: body.categoryId,
    channel: "MOBILE",
    subject: body.subject,
    description: body.description,
    openerUserId: user?.userId ?? null,
    openerRole: "CUSTOMER",
    contact: { name: body.contactName ?? "Mobile user", email: body.contactEmail ?? null },
    links: { customerId: customer?.id ?? null },
  });
  return Response.json({ id: res.id, caseNumber: res.caseNumber });
}
