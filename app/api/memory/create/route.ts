// app/api/memory/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { MemoryServiceError, memoryService } from "@/lib/memory-service";
import { CreateMemoryRequest } from "@/lib/memory-types";
import { createServerServiceClient } from "@/lib/supabase/server";
import { canUseMemory, getPlan } from "@/lib/plan-policy";

export const POST = withAuth(async function POST(request: NextRequest, auth) {
  try {
    const userId = auth.userId;

    const supabase = createServerServiceClient();
    const { data: { user } } = await supabase.auth.getUser(auth.bearer);

    const plan = getPlan(user);
    const isPro = canUseMemory(plan);

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

    const sourceId = body.sourceId.trim();
    const summary = body.summary.trim();

    const result =
      body.sourceType === "chat"
        ? await memoryService.createMemoryFromChat({
            userId,
            chatSessionId: sourceId,
            customSummary: summary,
            sourceDate: body.sourceDate,
            plan,
            isPro,
          })
        : await memoryService.createMemoryFromJournal({
            userId,
            journalEntryId: sourceId,
            customSummary: summary,
            sourceDate: body.sourceDate,
            plan,
            isPro,
          });

    return NextResponse.json(
      {
        success: true,
        message: "Memory created",
        memory: result.memory,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      const message =
        error.status === 403
          ? "Memory feature available for pro users only"
          : error.message;
      return NextResponse.json({ error: message }, { status: error.status });
    }

    console.error("Memory create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
