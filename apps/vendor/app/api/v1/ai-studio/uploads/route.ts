import { NextRequest, NextResponse } from "next/server";
import { getStorage, buildKey } from "@ayvana/storage";
import { UPLOAD_LIMITS } from "@ayvana/fashion";
import { getCorrelationId, CORRELATION_HEADER, logger } from "@ayvana/observability";
import { safeCurrentUser } from "../../../../lib/auth";
import { getVendorByUserId } from "../../../../lib/vendor";

const log = logger.child({ module: "api.ai-studio.uploads" });

// Accept garment photos and store them under the vendor's `original/` prefix.
// Returns storage keys + dimensions the client passes to createGarmentAction
// (which runs QC). Bytes never touch the DB. In a Blob-configured deployment
// this would hand back signed PUT URLs instead; the keyless path writes
// server-side through SimulatedStorage so dev needs no object store.
export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const withCid = (body: unknown, init?: ResponseInit) =>
    NextResponse.json(body, { ...init, headers: { [CORRELATION_HEADER]: correlationId } });

  const user = await safeCurrentUser();
  if (!user) return withCid({ error: "Unauthorized" }, { status: 401 });

  const vendor = await getVendorByUserId(user.id);
  if (!vendor || vendor.status !== "ACTIVE") return withCid({ error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return withCid({ error: "Invalid form data" }, { status: 400 });
  }

  const storage = getStorage();
  const uploaded: {
    role: string;
    storageKey: string;
    contentType: string;
    bytes: number;
    width?: number;
    height?: number;
  }[] = [];

  // Fields are named role_<ROLE> (e.g. role_FRONT); the client reads dimensions.
  const entries = [...formData.entries()];
  const files = entries.filter(([, v]) => v instanceof File) as [string, File][];

  if (files.length === 0) return withCid({ error: "No photos uploaded" }, { status: 400 });
  if (files.length > UPLOAD_LIMITS.maxImages) {
    return withCid({ error: `At most ${UPLOAD_LIMITS.maxImages} photos.` }, { status: 400 });
  }

  for (const [field, file] of files) {
    const role = field.startsWith("role_") ? field.slice(5).toUpperCase() : "DETAIL";
    const contentType = file.type || "image/jpeg";
    if (file.size > UPLOAD_LIMITS.maxBytes) {
      return withCid({ error: `"${role}" exceeds the ${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)}MB limit.` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const key = `${vendor.id}/${Date.now()}-${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await storage.put({ prefix: "original", key, contentType, body: buf });
    if (res.status === "failed") {
      log.error("upload put failed", { correlationId, error: res.error });
      return withCid({ error: "Storage is not available. Please try again." }, { status: 503 });
    }
    const dimW = Number(formData.get(`w_${role}`));
    const dimH = Number(formData.get(`h_${role}`));
    uploaded.push({
      role,
      storageKey: buildKey("original", key),
      contentType,
      bytes: file.size,
      width: Number.isFinite(dimW) && dimW > 0 ? dimW : undefined,
      height: Number.isFinite(dimH) && dimH > 0 ? dimH : undefined,
    });
  }

  log.info("uploads stored", { correlationId, vendorId: vendor.id, count: uploaded.length });
  return withCid({ uploaded });
}
