export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { withOptionalAuth } from "@/lib/api-auth";
import { withCORS } from "@/lib/cors";
import { getSafetyResources, regionFromLocale } from "@/lib/safety-resources";

export const GET = withCORS(
  withOptionalAuth(async function GET(req: NextRequest) {
    const url = new URL(req.url);

    const regionFromQuery = (url.searchParams.get("region") || "").trim().toUpperCase();
    const locale = (url.searchParams.get("locale") || "").trim();
    const regionFromLocaleGuess = regionFromLocale(locale);
    const regionFromGeo = (req.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();

    const region = regionFromGeo || regionFromQuery || regionFromLocaleGuess || "";
    const resources = getSafetyResources(region);

    return NextResponse.json(
      {
        ok: true,
        ...resources,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  }),
  { credentials: true }
);
