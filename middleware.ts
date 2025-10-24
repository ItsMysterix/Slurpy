// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { makeNonce, cspHeader } from "@/lib/csp";

const isPublicRoute = createRouteMatcher([
  "/",
  "/auth(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/email-verify-page(.*)", 
  "/forgot-password(.*)",
  "/reset-password(.*)", 
  "/terms",
  "/privacy",
  "/how-it-works",
  "/sso-callback(.*)",      
  "/health",                
  "/api/public(.*)",        
  "/api/webhook(.*)",       
]);

function withSecurityHeaders(req: NextRequest, res: NextResponse) {
  try {
    const nonce = makeNonce();
    const isDev = process.env.NODE_ENV !== "production";
    res.headers.set("Content-Security-Policy", cspHeader({ nonce, isDev }));
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // Only set HSTS when on production domains (https)
    const host = req.headers.get("host") ?? "";
    const isProdHost = host.endsWith("slurpy.life");
    if (isProdHost && req.nextUrl.protocol === "https:") {
      res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
  } catch {}
  return res;
}

export default clerkMiddleware(async (auth, req) => {
  // Fast-path CORS preflight for API routes
  if (req.method === "OPTIONS" && req.nextUrl.pathname.startsWith("/api/")) {
    const origin = (() => {
      const o = req.headers.get("origin");
      try { if (!o) return null; const u = new URL(o); return `${u.protocol}//${u.host}`; } catch { return null; }
    })();
    const allowFromEnv = (process.env.CORS_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const defaults = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://localhost:3000",
    ];
    const allow = Array.from(new Set([...allowFromEnv, ...defaults]));

    if (!origin || !allow.includes(origin)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

  const res = new NextResponse(null, { status: 204 });
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      [
        "content-type",
        "authorization",
        "x-e2e-user",
        "x-e2e-stream",
        "x-e2e-rl-limit",
        "x-e2e-stub-journal",
        "x-csrf",
      ].join(",")
    );
    return res;
  }

  // Canonicalize prod host (won’t affect localhost)
  const host = req.headers.get("host") ?? "";
  if (host === "www.slurpy.life") {
    const url = req.nextUrl.clone();
    url.hostname = "slurpy.life";
    return withSecurityHeaders(req, NextResponse.redirect(url, 308));
  }

  // Allow public routes
  if (isPublicRoute(req)) return withSecurityHeaders(req, NextResponse.next());

  // E2E test bypass: when enabled, treat all routes as public to simplify browser tests
  if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
    return withSecurityHeaders(req, NextResponse.next());
  }

  // Protect everything else
  const { userId } = await auth();
  if (!userId) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return withSecurityHeaders(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return withSecurityHeaders(req, NextResponse.redirect(redirectUrl));
  }

  return withSecurityHeaders(req, NextResponse.next());
});

export const config = {
  matcher: ["/((?!_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)"],
};
