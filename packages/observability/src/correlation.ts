export const CORRELATION_HEADER = "x-correlation-id";

/**
 * Correlation id for a request: reuse an inbound `x-correlation-id` (so a trace
 * spans services) or mint a new one. Safe for edge/runtime — uses Web Crypto.
 */
export function getCorrelationId(req: { headers: { get(name: string): string | null } }): string {
  const incoming = req.headers.get(CORRELATION_HEADER);
  if (incoming && incoming.length <= 128) return incoming;
  return newCorrelationId();
}

export function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
