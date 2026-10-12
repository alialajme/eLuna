import { prisma, addCaseMessage } from "@ayvana/db";
import { resolveMobileCustomer } from "../../../_customer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body?.body?.trim()) return Response.json({ error: "body is required" }, { status: 400 });
  // Fail closed: authenticated opener who strictly owns the case before writing.
  const customer = await resolveMobileCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const c = await prisma.case.findUnique({ where: { id }, select: { openerUserId: true } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const user = await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } });
  if (!user?.userId || c.openerUserId !== user.userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const res = await addCaseMessage({ caseId: id, authorUserId: user.userId, authorRole: "CUSTOMER", body: body.body.trim(), channel: "MOBILE" });
  return Response.json({ id: res.id });
}
