import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness: the process is up and serving. MUST NOT depend on external services
// (a transient DB/provider outage should not trigger a pod restart).
export function GET() {
  return NextResponse.json({ status: "live" }, { status: 200 });
}
