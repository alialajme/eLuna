// Shared HTTP security headers for all AYVANA Next.js apps.
//
// Deliberately conservative on CSP: we lock down framing, base-uri and plugins
// (clickjacking / base-tag / object injection) WITHOUT constraining script-src,
// because a strict nonce-based script-src across Next.js RSC + Clerk needs
// per-request nonce middleware and full runtime testing (tracked as a follow-up
// in docs/PRODUCTION-HARDENING.md). Everything here is safe to ship as static
// config and does not break Next/Clerk script loading.

/** @returns {{ key: string, value: string }[]} */
export function securityHeaders() {
  return [
    // Force HTTPS for 2 years incl. subdomains (only honored over HTTPS).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    // Block MIME-type sniffing.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy clickjacking protection (CSP frame-ancestors is the modern form).
    { key: "X-Frame-Options", value: "DENY" },
    // Don't leak full URLs cross-origin.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Drop powerful features the storefront/dashboards don't use.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    // Clickjacking + base-tag hijack + plugin/object injection protection.
    {
      key: "Content-Security-Policy",
      value: ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; "),
    },
  ];
}

/**
 * Next.js `headers()` config applying the security headers to every route.
 * @returns {Promise<Array<{ source: string, headers: { key: string, value: string }[] }>>}
 */
export async function securityHeadersConfig() {
  return [{ source: "/:path*", headers: securityHeaders() }];
}
