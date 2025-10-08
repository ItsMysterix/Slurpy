// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/auth(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/email-verify-page(.*)", 
  "/forgot-password(.*)",
  "/terms",
  "/privacy",
  "/how-it-works",
  "/sso-callback(.*)",      
  "/health",                
  "/api/public(.*)",        
  "/api/webhook(.*)",       
]);

export default clerkMiddleware(async (auth, req) => {
  // Canonicalize prod host (won’t affect localhost)
  const host = req.headers.get("host") ?? "";
  if (host === "www.slurpy.life") {
    const url = req.nextUrl.clone();
    url.hostname = "slurpy.life";
    return NextResponse.redirect(url, 308);
  }

  // Allow public routes
  if (isPublicRoute(req)) return NextResponse.next();

  // Protect everything else
  const { userId } = await auth();
  if (!userId) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)"],
};
