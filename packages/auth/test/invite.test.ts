import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createInvitation = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: { invitations: { createInvitation: (...a: unknown[]) => createInvitation(...a) } },
}));

import { invitePartner } from "../src/invite";

const ORIGINAL_KEY = process.env.CLERK_SECRET_KEY;

beforeEach(() => {
  createInvitation.mockReset();
  createInvitation.mockResolvedValue({ id: "inv_x" });
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = ORIGINAL_KEY;
});

describe("invitePartner", () => {
  it("no-ops (no Clerk call) when CLERK_SECRET_KEY is unset", async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = await invitePartner({ email: "v@x.ae", role: "VENDOR", vendorId: "v1" });
    expect(res).toEqual({ invited: false, reason: "no_clerk_key" });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("sends an invitation carrying role + vendorId in publicMetadata", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    const res = await invitePartner({
      email: "v@x.ae",
      role: "VENDOR",
      vendorId: "v1",
      redirectUrl: "https://sell.luna.ae/sign-up",
    });
    expect(res).toEqual({ invited: true });
    expect(createInvitation).toHaveBeenCalledWith({
      emailAddress: "v@x.ae",
      publicMetadata: { role: "VENDOR", vendorId: "v1" },
      redirectUrl: "https://sell.luna.ae/sign-up",
      ignoreExisting: true,
    });
  });

  it("carries supplierId for suppliers and omits redirectUrl when not given", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    await invitePartner({ email: "s@x.ae", role: "SUPPLIER", supplierId: "s1" });
    expect(createInvitation).toHaveBeenCalledWith({
      emailAddress: "s@x.ae",
      publicMetadata: { role: "SUPPLIER", supplierId: "s1" },
      ignoreExisting: true,
    });
  });

  it("swallows a Clerk error (never throws — provisioning already wrote the DB)", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    createInvitation.mockRejectedValueOnce(new Error("clerk 422"));
    const res = await invitePartner({ email: "v@x.ae", role: "VENDOR", vendorId: "v1" });
    expect(res).toEqual({ invited: false, reason: "clerk_error" });
  });
});
