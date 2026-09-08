import { NextResponse } from "next/server";
import { checkDatabase } from "@e-luna/db";

export const dynamic = "force-dynamic";

// Readiness: only advertise ready when critical dependencies (the database) are
// reachable, so the load balancer stops routing to a pod that can't serve.
export async function GET() {
  const db = await checkDatabase();
  if (!db.ok) {
    return NextResponse.json({ status: "not_ready", db: "down" }, { status: 503 });
  }
  return NextResponse.json({ status: "ready", db: "up" }, { status: 200 });
}
