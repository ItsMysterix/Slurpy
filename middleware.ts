// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { makeNonce, cspHeader } from "@/lib/csp";
import { hasInsecureProdBypass, isE2EBypassEnabled } from "@/lib/runtime-safety";

const PUBLIC_ROUTES = [
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
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((p) => {
    if (p.endsWith("(.*)")) {
      const base = p.slice(0, -4);
      return pathname.startsWith(base);
    }
    return pathname === p;
  });
}

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

export default async function middleware(req: NextRequest) {
  if (hasInsecureProdBypass()) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

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
      const e2eBypass = isE2EBypassEnabled();
      const allowHeaders = [
        "content-type",
        "authorization",
        "x-csrf",
        ...(e2eBypass
          ? ["x-e2e-user", "x-e2e-stream", "x-e2e-rl-limit", "x-e2e-stub-journal"]
          : []),
      ];
    res.headers.set(
        "Access-Control-Allow-Headers",
        allowHeaders.join(",")
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
  if (isPublic(req.nextUrl.pathname)) return withSecurityHeaders(req, NextResponse.next());

  // Protected routes - check for auth
  const PROTECTED_ROUTES = ["/chat", "/profile", "/calendar", "/journal", "/insights", "/plans"];
  const isProtected = PROTECTED_ROUTES.some(route => req.nextUrl.pathname.startsWith(route));
  
  if (isProtected) {
    // Check for session token
    const token = req.cookies.get("__session")?.value || 
                  req.headers.get("authorization")?.replace("Bearer ", "");
    
    // E2E bypass
    const e2eBypass = isE2EBypassEnabled();
    const e2eUser = e2eBypass && req.headers.get("x-e2e-user");
    
    if (!token && !e2eUser) {
      // Redirect to sign-in with return URL
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect", req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return withSecurityHeaders(req, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)"],
};
