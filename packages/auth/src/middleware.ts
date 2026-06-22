import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "./roles";

type LunaClaims = { metadata?: { role?: UserRole; mfaEnabled?: boolean } };

function parseClaims(sessionClaims: unknown): LunaClaims {
  if (
    sessionClaims &&
    typeof sessionClaims === "object" &&
    "metadata" in sessionClaims &&
    (sessionClaims.metadata === null || typeof sessionClaims.metadata === "object")
  ) {
    return sessionClaims as LunaClaims;
  }
  return {};
}

const CUSTOMER_PUBLIC_ROUTES = [
  "/",
  "/browse(.*)",
  "/p/(.*)",
  "/vendors/(.*)",
  "/chat(.*)",
  "/api/chat(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/health",
];

export function createLunaMiddleware(appRole: UserRole) {
  const isPublicRoute =
    appRole === "CUSTOMER"
      ? createRouteMatcher(CUSTOMER_PUBLIC_ROUTES)
      : createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)", "/api/health"]);

  const isProtectedRoute =
    appRole === "CUSTOMER"
      ? createRouteMatcher(["/cart(.*)", "/checkout(.*)", "/orders(.*)", "/profile(.*)", "/wishlist(.*)", "/wallet(.*)"])
      : null;

  return clerkMiddleware(async (auth, req) => {
    if (isPublicRoute(req)) return NextResponse.next();

    // For customer app: only protected routes need auth
    if (appRole === "CUSTOMER" && isProtectedRoute && !isProtectedRoute(req)) {
      return NextResponse.next();
    }

    const { userId, sessionClaims } = await auth();

    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    const claims = parseClaims(sessionClaims);
    const userRole = claims.metadata?.role;
    const mfaEnabled = claims.metadata?.mfaEnabled;

    if (userRole !== appRole) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("error", "invalid_role");
      return NextResponse.redirect(signInUrl);
    }

    // MFA is mandatory for all user types (per CLAUDE.md security requirement)
    if (!mfaEnabled) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("error", "mfa_required");
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  });
}
