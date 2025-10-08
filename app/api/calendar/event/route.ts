// app/api/calendar/event/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const toYMD = (isoOrDate: string | Date) => {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
}
