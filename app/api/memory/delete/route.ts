// app/api/memory/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const memoryId = body.memoryId;

    if (!memoryId) {
      return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
    }

    // Verify the memory belongs to the user before deleting
    const { data: memory } = await supabase
      .from("UserMemory")
      .select("id")
      .eq("id", memoryId)
      .eq("userId", userId)
      .single();

    if (!memory) {
      return NextResponse.json(
        { error: "Memory not found or unauthorized" },
        { status: 404 }
      );
    }

    // Delete memory
    const { error } = await supabase
      .from("UserMemory")
      .delete()
      .eq("id", memoryId)
      .eq("userId", userId);

    if (error) {
      console.error("Memory deletion error:", error);
      return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Memory deleted permanently",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Memory delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
