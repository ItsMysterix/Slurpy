// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Mark pages that must be accessible without a session
const isPublicRoute = createRouteMatcher([
  "/",
  "/auth(.*)",               // your custom auth page
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/terms",
  "/privacy",
  "/sso-callback(.*)",       // Clerk OAuth callback must be public
  "/api/webhook(.*)",        // webhooks public
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes to pass through
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();

  // If no session:
  if (!userId) {
    // For API routes: return 401 (no redirects)
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For pages: redirect to sign-in (clone URL before mutating)
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated: continue
  return NextResponse.next();
});

export const config = {
  // apply to everything except static files and Next internals
  matcher: ["/((?!_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)"],
};
