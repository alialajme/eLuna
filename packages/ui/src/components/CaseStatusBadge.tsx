const TONE: Record<string, string> = {
  NEW: "bg-sand text-mist",
  ASSIGNED: "bg-gold/20 text-gold",
  IN_PROGRESS: "bg-gold/20 text-gold",
  WAITING_CUSTOMER: "bg-sand text-mist",
  RESOLVED: "bg-sage/20 text-sage",
  CLOSED: "bg-sage/20 text-sage",
  CANCELLED: "bg-coral/20 text-coral",
};

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-label font-medium ${TONE[status] ?? "bg-sand text-mist"}`}
    >
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
