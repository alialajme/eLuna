import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
  if (!middlewareInstance) return NextResponse.next();
  return middlewareInstance(req, {} as never);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
