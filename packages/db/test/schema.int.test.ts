import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { makeCategory } from "./factories";

describe("case schema (integration)", () => {
  it("persists a CaseCategory and a Case with the new enums", async () => {
    const cat = await makeCategory({ slug: `svc_${Date.now()}` });
    const c = await prisma.case.create({
      data: {
        caseNumber: `CS-TEST-${Date.now()}`,
        type: "COMPLAINT",
        categoryId: cat.id,
        channel: "WHATSAPP",
        priority: "URGENT",
        subject: "s",
        description: "d",
        openerRole: "SUPPLIER",
        contactName: "x",
      },
    });
    expect(c.status).toBe("NEW");
    expect(c.priority).toBe("URGENT");

    const roundtrip = await prisma.case.findUnique({ where: { id: c.id } });
    expect(roundtrip?.channel).toBe("WHATSAPP");
  });
});
