import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Clerk backend client that sync.ts imports. v6: clerkClient is an
// async factory returning the client.
const updateUserMetadata = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { updateUserMetadata: (...args: unknown[]) => updateUserMetadata(...args) } }),
}));

import { syncClerkRole } from "../src/sync";

const ORIGINAL_KEY = process.env.CLERK_SECRET_KEY;

beforeEach(() => {
  updateUserMetadata.mockReset();
  updateUserMetadata.mockResolvedValue({});
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = ORIGINAL_KEY;
});

describe("syncClerkRole", () => {
  it("no-ops (no Clerk call) when CLERK_SECRET_KEY is unset — the demo/local path", async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = await syncClerkRole("user_1", { role: "VENDOR", vendorId: "v1" });
    expect(res).toEqual({ synced: false, reason: "no_clerk_key" });
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("pushes role + vendorId into Clerk publicMetadata when configured", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    const res = await syncClerkRole("user_2", { role: "VENDOR", vendorId: "v2" });
    expect(res).toEqual({ synced: true });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_2", {
      publicMetadata: { role: "VENDOR", vendorId: "v2" },
    });
  });

  it("pushes role + supplierId for suppliers", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    await syncClerkRole("user_3", { role: "SUPPLIER", supplierId: "s3" });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_3", {
      publicMetadata: { role: "SUPPLIER", supplierId: "s3" },
    });
  });

  it("omits vendor/supplier id keys when not provided", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    await syncClerkRole("user_4", { role: "ADMIN" });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_4", {
      publicMetadata: { role: "ADMIN" },
    });
  });

  it("swallows a Clerk API error (never throws — DB stays source of truth)", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    updateUserMetadata.mockRejectedValueOnce(new Error("clerk 500"));
    const res = await syncClerkRole("user_5", { role: "VENDOR", vendorId: "v5" });
    expect(res).toEqual({ synced: false, reason: "clerk_error" });
  });
});
