import { prisma } from "@ayvana/db";
import { resolveMobileCustomer } from "../../_customer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Fail closed: authenticated opener who strictly owns the case.
  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const c = await prisma.case.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, category: { select: { name: true } } } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } });
  if (!user?.userId || c.openerUserId !== user.userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({
    id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status, category: c.category.name,
    messages: c.messages.filter((m) => !m.isInternal).map((m) => ({ id: m.id, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt })),
  });
}
