// app/api/memory/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { MemoryServiceError, memoryService } from "@/lib/memory-service";
import { createServerServiceClient } from "@/lib/supabase/server";
import { canUseMemory, getPlan } from "@/lib/plan-policy";

export const GET = withAuth(async function GET(request: NextRequest, auth) {
  try {
    const userId = auth.userId;

    const supabase = createServerServiceClient();
    const { data: { user } } = await supabase.auth.getUser(auth.bearer);

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
});
