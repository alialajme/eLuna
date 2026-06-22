import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isDev = process.env.NODE_ENV !== "production";

// Fail closed in production if Clerk keys are missing
if (!hasClerkKeys && !isDev) {
  throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required in production");
}

async function getMiddleware() {
  if (!hasClerkKeys) return null;
  const { createLunaMiddleware } = await import("@e-luna/auth/middleware");
  return createLunaMiddleware("CUSTOMER");
}

let middlewareInstance: Awaited<ReturnType<typeof getMiddleware>> = null;
let initialized = false;

export async function middleware(req: NextRequest) {
  if (!initialized) {
    middlewareInstance = await getMiddleware();
    initialized = true;
  }
  // Dev-only: allow all traffic when Clerk is not configured (local preview)
  if (!middlewareInstance) {
    return isDev
      ? NextResponse.next()
      : new NextResponse("Auth not configured", { status: 503 });
  }
  return middlewareInstance(req, {} as never);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
