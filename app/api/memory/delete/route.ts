// app/api/memory/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { MemoryServiceError, memoryService } from "@/lib/memory-service";
import { createServerServiceClient } from "@/lib/supabase/server";
import { canUseMemory, getPlan } from "@/lib/plan-policy";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const userId = auth.userId;
    const body = await request.json();
    const memoryId = body.memoryId;

    const supabase = createServerServiceClient();
    const { data: { user } } = await supabase.auth.getUser(auth.bearer);

    const plan = getPlan(user);
    const isPro = canUseMemory(plan);

    if (!memoryId) {
      return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
    }

    await memoryService.deleteMemory({ userId, memoryId, plan, isPro });

    return NextResponse.json(
      {
        success: true,
        message: "Memory deleted permanently",
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Memory delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
