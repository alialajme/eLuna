import { prisma } from "./client";
import type { CasePriority, CaseTeam } from "@prisma/client";

export const DEFAULT_CASE_CATEGORIES: {
  slug: string;
  name: string;
  description: string;
  defaultPriority: CasePriority;
  defaultTeam: CaseTeam | null;
  sortOrder: number;
}[] = [
  { slug: "service", name: "Service", description: "General service issues", defaultPriority: "MEDIUM", defaultTeam: "CALL_CENTER", sortOrder: 10 },
  { slug: "refund", name: "Refund", description: "Refund requests and disputes", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 20 },
  { slug: "studio", name: "AI Studio", description: "AI Fashion Studio problems", defaultPriority: "MEDIUM", defaultTeam: "SUPPORT", sortOrder: 30 },
  { slug: "delivery", name: "Delivery", description: "Shipping and delivery", defaultPriority: "HIGH", defaultTeam: "CALL_CENTER", sortOrder: 40 },
  { slug: "product-quality", name: "Product Quality", description: "Damaged or defective items", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 50 },
  { slug: "payment", name: "Payment", description: "Payment and billing", defaultPriority: "HIGH", defaultTeam: "SUPPORT", sortOrder: 60 },
  { slug: "suggestion", name: "Suggestion", description: "Feature ideas and feedback", defaultPriority: "LOW", defaultTeam: "CALL_CENTER", sortOrder: 70 },
  { slug: "other", name: "Other", description: "Anything else", defaultPriority: "MEDIUM", defaultTeam: "CALL_CENTER", sortOrder: 80 },
];

/** Idempotently upsert the default case categories (safe to run repeatedly). */
export async function seedCaseCategories(): Promise<void> {
  for (const c of DEFAULT_CASE_CATEGORIES) {
    await prisma.caseCategory.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, description: c.description, defaultPriority: c.defaultPriority, defaultTeam: c.defaultTeam, sortOrder: c.sortOrder },
    });
  }
}
