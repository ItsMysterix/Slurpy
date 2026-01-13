// app/api/memory/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CreateMemoryRequest } from "@/lib/memory-types";
import { v4 as uuidv4 } from "uuid";

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

    // Check if user is pro (memory only available for pro/elite)
    const isPro =
      user.user_metadata?.plan === "pro" || user.user_metadata?.plan === "elite";

    if (!isPro) {
      return NextResponse.json(
        { error: "Memory feature available for pro users only" },
        { status: 403 }
      );
    }

    const body: CreateMemoryRequest = await request.json();

    // Validate required fields
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "Summary is required" }, { status: 400 });
    }

    if (!["chat", "journal"].includes(body.sourceType)) {
      return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
    }

    if (!body.sourceId?.trim()) {
      return NextResponse.json({ error: "Source ID is required" }, { status: 400 });
    }

    // Insert memory
    const { data, error } = await supabase
      .from("UserMemory")
      .insert({
        id: uuidv4(),
        userId,
        summary: body.summary.trim().slice(0, 2000), // Max 2000 chars
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        sourceDate: body.sourceDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Memory creation error:", error);
      return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Memory created",
        memory: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Memory create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
