import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
