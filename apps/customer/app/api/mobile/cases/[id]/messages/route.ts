import { prisma, addCaseMessage } from "@ayvana/db";
import { resolveMobileCustomer } from "../../../_customer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body?.body?.trim()) return Response.json({ error: "body is required" }, { status: 400 });
  const customer = await resolveMobileCustomer();
  const c = await prisma.case.findUnique({ where: { id }, select: { openerUserId: true } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const user = customer ? await prisma.customerProfile.findUnique({ where: { id: customer.id }, select: { userId: true } }) : null;
  if (c.openerUserId && user?.userId && c.openerUserId !== user.userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const res = await addCaseMessage({ caseId: id, authorUserId: user?.userId ?? null, authorRole: "CUSTOMER", body: body.body.trim(), channel: "MOBILE" });
  return Response.json({ id: res.id });
}
