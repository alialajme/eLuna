const SHIPMENT_STAGES = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function TrackingTimeline({ status }: { status: string }) {
  if (status === "FAILED" || status === "RETURNED") {
    return (
      <p className="text-body-sm text-coral capitalize">
        {status.toLowerCase()}
      </p>
    );
  }
  const currentStageIndex = SHIPMENT_STAGES.indexOf(status as (typeof SHIPMENT_STAGES)[number]);
  return (
    <div className="flex items-start">
      {SHIPMENT_STAGES.map((stage, idx) => (
        <div key={stage} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            <div className={`h-3 w-3 shrink-0 rounded-full ${idx <= currentStageIndex ? "bg-ink" : "bg-sand"}`} />
            {idx < SHIPMENT_STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 ${idx < currentStageIndex ? "bg-ink" : "bg-sand"}`} />
            )}
          </div>
          <p className={`mt-1 text-body-xs text-center ${idx <= currentStageIndex ? "text-ink" : "text-mist"}`}>
            {stage.replace(/_/g, " ")}
          </p>
        </div>
      ))}
    </div>
  );
}
