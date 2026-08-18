import { NextRequest, NextResponse } from "next/server";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";

export async function POST(req: NextRequest) {
  const user = await safeCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Gate to ACTIVE vendors only — this endpoint should not be callable by arbitrary signed-in users.
  const vendor = await getVendorByUserId(user.id);
  if (!vendor || vendor.status !== "ACTIVE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const urls: string[] = [];

  for (const key of ["photo0", "photo1", "photo2"] as const) {
    const file = formData.get(key) as File | null;
    if (!file) {
      return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: `${key} exceeds 10 MB limit` },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    urls.push(`data:${mimeType};base64,${base64}`);
  }

  return NextResponse.json({ urls });
}
