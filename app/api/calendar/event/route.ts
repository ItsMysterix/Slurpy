// app/api/calendar/event/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createServerServiceClient } from "@/lib/supabase/server";
import { guardRate } from "@/lib/guards";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";

function sb() {
  return createServerServiceClient();
}

const toYMD = (isoOrDate: string | Date) => {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export const POST = withCORS(withAuth(async function POST(req: NextRequest, auth) {
  try {
    const userId = auth.userId;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Limit calendar write ops to 30/min/user
    {
      const limited = await guardRate(req, { key: "calendar-write", limit: 30, windowMs: 60_000 });
      if (limited) return limited;
    }

    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    const { date, title, location, location_lat, location_lng, emotion, intensity, notes } = await req.json();

    if (!date || !title?.trim()) {
      return NextResponse.json({ error: "date and title are required" }, { status: 400 });
    }

    const supabase = sb();
    const { data, error } = await supabase
      .from("calendar_events")
      .insert([
        {
          user_id: userId,
          date: toYMD(date),                 // ← store as DATE
          title: String(title).trim(),
          location_label: location ?? null,  // ← correct column
          location_lat: typeof location_lat === "number" ? location_lat : null,
          location_lng: typeof location_lng === "number" ? location_lng : null,
          emotion: emotion ?? null,
          intensity: typeof intensity === "number" ? intensity : null,
          notes: notes ?? null,
        },
      ])
      .select("id");

    if (error) throw error;

    return NextResponse.json({ success: true, id: data?.[0]?.id ?? null });
  } catch (e) {
    console.error("Error creating event:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}), { credentials: true });
