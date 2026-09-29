import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { reconcileClerkUser } from "../src/clerk-sync";

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function userEvent(opts: {
  type?: string;
  id: string;
  email: string;
  role?: string;
  mfa?: boolean;
}) {
  return {
    type: opts.type ?? "user.created",
    data: {
      id: opts.id,
      email_addresses: [{ id: "e1", email_address: opts.email }],
      primary_email_address_id: "e1",
      public_metadata: opts.role ? { role: opts.role } : {},
      two_factor_enabled: opts.mfa ?? false,
    },
  };
}

describe("reconcileClerkUser (integration)", () => {
  it("reconciles a provisioned placeholder vendor to the real Clerk id", async () => {
    const email = `${uid("v")}@x.ae`;
    const placeholderId = `inv_${uid("ph")}`;
    const slug = uid("store");
    await prisma.user.create({ data: { id: placeholderId, email, role: "VENDOR" } });
    const vendor = await prisma.vendor.create({
      data: { userId: placeholderId, storeName: "Test", storeSlug: slug, status: "ACTIVE" },
      select: { id: true },
    });

    const clerkId = `user_${uid("real")}`;
    const res = await reconcileClerkUser(userEvent({ id: clerkId, email, role: "VENDOR", mfa: true }));
    expect(res.action).toBe("reconciled");

    // Placeholder gone; real user present with MFA; vendor now points at the real id.
    expect(await prisma.user.findUnique({ where: { id: placeholderId } })).toBeNull();
    const real = await prisma.user.findUnique({ where: { id: clerkId } });
    expect(real?.email).toBe(email);
    expect(real?.mfaEnabled).toBe(true);
    const movedVendor = await prisma.vendor.findUnique({ where: { id: vendor.id }, select: { userId: true } });
    expect(movedVendor?.userId).toBe(clerkId);
  });

  it("creates a DB user for a normal signup (defaults role to CUSTOMER)", async () => {
    const email = `${uid("c")}@x.ae`;
    const clerkId = `user_${uid("cust")}`;
    const res = await reconcileClerkUser(userEvent({ id: clerkId, email }));
    expect(res.action).toBe("upserted");
    const u = await prisma.user.findUnique({ where: { id: clerkId } });
    expect(u?.role).toBe("CUSTOMER");
  });

  it("updates an existing user by id (email + MFA sync), idempotent on retry", async () => {
    const clerkId = `user_${uid("upd")}`;
    const email = `${uid("u")}@x.ae`;
    await prisma.user.create({ data: { id: clerkId, email: `${uid("old")}@x.ae`, role: "CUSTOMER", mfaEnabled: false } });

    const res = await reconcileClerkUser(userEvent({ id: clerkId, email, mfa: true }));
    expect(res.action).toBe("upserted");
    const u = await prisma.user.findUnique({ where: { id: clerkId } });
    expect(u?.email).toBe(email);
    expect(u?.mfaEnabled).toBe(true);
  });

  it("ignores non-user events", async () => {
    const res = await reconcileClerkUser(userEvent({ type: "session.created", id: "sess_1", email: "x@x.ae" }));
    expect(res.action).toBe("ignored");
  });
});
