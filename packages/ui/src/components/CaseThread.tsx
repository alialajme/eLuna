export type CaseThreadMessage = {
  id: string;
  authorRole: string;
  body: string;
  isInternal: boolean;
  createdAt: string | Date;
};

export function CaseThread({
  messages,
  showInternal = false,
}: {
  messages: CaseThreadMessage[];
  showInternal?: boolean;
}) {
  const visible = messages.filter((m) => showInternal || !m.isInternal);
  return (
    <div className="flex flex-col gap-3">
      {visible.map((m) => (
        <div
          key={m.id}
          className={`rounded-md border p-3 ${m.isInternal ? "border-gold/40 bg-gold/5" : "border-sand bg-white"}`}
        >
          <div className="mb-1 flex items-center gap-2 text-label text-mist">
            <span className="font-medium text-ink">{m.authorRole.toLowerCase()}</span>
            {m.isInternal && <span className="text-gold">internal</span>}
            <span>{new Date(m.createdAt).toLocaleString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-body-sm text-ink">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
