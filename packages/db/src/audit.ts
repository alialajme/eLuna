import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type AuditEntry = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string; // dotted verb, e.g. "payout.completed", "authz.denied"
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
};

// Keys that must never be persisted to the audit trail, even if a caller passes
// them in metadata by mistake. Defense against accidental secret/PII leakage.
const REDACT_KEYS = new Set([
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "card",
  "cardnumber",
  "cvv",
  "pan",
]);

function sanitize(meta: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out as Prisma.InputJsonValue;
}

/**
 * Append an immutable audit-log row. Pass a transaction client to make the audit
 * entry atomic with the action it records (preferred for financial/admin ops).
 */
export async function writeAuditLog(client: Client, entry: AuditEntry) {
  return client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: sanitize(entry.metadata),
      ip: entry.ip ?? null,
    },
  });
}

/**
 * Best-effort audit write for non-transactional call sites (e.g. logging an
 * authorization denial). Never throws — a failed audit must not break the
 * request path — but logs to stderr so failures are visible.
 */
export async function auditSafe(entry: AuditEntry): Promise<void> {
  try {
    await writeAuditLog(prisma, entry);
  } catch (e) {
    console.error("[audit] failed to write", entry.action, e);
  }
}
