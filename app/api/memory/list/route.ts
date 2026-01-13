// app/api/memory/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { usePlan } from "@/lib/use-plan";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Check if user is pro (memory only available for pro/elite)
    const isPro =
      user.user_metadata?.plan === "pro" || user.user_metadata?.plan === "elite";

    if (!isPro) {
      return NextResponse.json(
        { memories: [], total: 0, message: "Memory feature available for pro users only" },
        { status: 200 }
      );
    }

    // Fetch user's memories, sorted by most recent first
    const { data, error, count } = await supabase
      .from("UserMemory")
      .select("*", { count: "exact" })
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Memory fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch memories" }, { status: 500 });
    }

    return NextResponse.json(
      {
        memories: data || [],
        total: count || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Memory list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
