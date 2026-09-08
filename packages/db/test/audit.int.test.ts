import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { writeAuditLog, auditSafe } from "../src/audit";

describe("audit log (integration)", () => {
  it("appends an immutable row with actor/action/target", async () => {
    const action = `test.action.${Date.now()}`;
    await writeAuditLog(prisma, {
      actorId: "usr_1",
      actorRole: "ADMIN",
      action,
      targetType: "Payout",
      targetId: "pay_1",
      metadata: { amount: "100.00" },
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action } });
    expect(row.actorId).toBe("usr_1");
    expect(row.actorRole).toBe("ADMIN");
    expect(row.targetType).toBe("Payout");
    expect(row.metadata).toEqual({ amount: "100.00" });
  });

  it("redacts sensitive metadata keys", async () => {
    const action = `test.redact.${Date.now()}`;
    await writeAuditLog(prisma, {
      action,
      metadata: { password: "hunter2", token: "abc", note: "ok" },
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action } });
    expect(row.metadata).toEqual({ password: "[redacted]", token: "[redacted]", note: "ok" });
  });

  it("participates in a transaction (atomic with the recorded action)", async () => {
    const action = `test.tx.${Date.now()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAuditLog(tx, { action });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.auditLog.count({ where: { action } })).toBe(0);
  });

  it("auditSafe never throws", async () => {
    await expect(auditSafe({ action: "test.safe" })).resolves.toBeUndefined();
  });
});
