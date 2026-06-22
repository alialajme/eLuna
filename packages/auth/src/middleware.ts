import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "./roles";

export function createLunaMiddleware(appRole: UserRole) {
  const isPublicRoute = createRouteMatcher([
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
  ]);

  return clerkMiddleware(async (auth, req) => {
    if (isPublicRoute(req)) return NextResponse.next();

    const { userId, sessionClaims } = await auth();

    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    const claims = sessionClaims as { metadata?: { role?: UserRole } } | null;
    const userRole = claims?.metadata?.role;

    if (userRole !== appRole) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    return NextResponse.next();
  });
}
