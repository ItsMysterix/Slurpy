// app/api/memory/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MemoryServiceError, memoryService } from "@/lib/memory-service";
import { createServerServiceClient } from "@/lib/supabase/server";
import { canUseMemory, getPlan } from "@/lib/plan-policy";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerServiceClient();

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    const plan = getPlan(user);
    const isPro = canUseMemory(plan);

    const { memories, total } = await memoryService.listMemoriesForContext({
      userId,
      plan,
      isPro,
      limit: 100,
    });

    return NextResponse.json({ memories, total }, { status: 200 });
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Memory list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
