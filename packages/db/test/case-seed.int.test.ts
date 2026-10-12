import { describe, it, expect } from "vitest";
import { prisma } from "../src";
import { seedCaseCategories, DEFAULT_CASE_CATEGORIES } from "../src/case-seed";

describe("seedCaseCategories (integration)", () => {
  it("is idempotent and upserts all defaults", async () => {
    await seedCaseCategories();
    await seedCaseCategories(); // second run must not duplicate
    for (const def of DEFAULT_CASE_CATEGORIES) {
      const rows = await prisma.caseCategory.findMany({ where: { slug: def.slug } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe(def.name);
    }
  });
});
