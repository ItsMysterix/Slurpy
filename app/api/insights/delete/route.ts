/*
 * POST /api/insights/delete
 * Delete an insight (user can only delete their own)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createServerServiceClient } from "@/lib/supabase/server";

interface DeleteInsightRequest {
  insightId: string;
}

interface DeleteInsightResponse {
  success: boolean;
  error?: string;
}

export const POST = withAuth(async function POST(
  request: NextRequest
  , auth
): Promise<NextResponse<DeleteInsightResponse>> {
  try {
    const supabase = createServerServiceClient();
    const userId = auth.userId;

    const body = (await request.json()) as DeleteInsightRequest;

    if (!body.insightId) {
      return NextResponse.json(
        { success: false, error: "insightId is required" },
        { status: 400 }
      );
    }

    // Verify ownership (RLS will handle this, but check client-side too)
    const { data: insight } = await supabase
      .from("insight_run")
      .select("user_id")
      .eq("id", body.insightId)
      .single();

    if (!insight || insight.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: "Not found or unauthorized" },
        { status: 404 }
      );
    }

    // Delete the insight
    const { error: deleteError } = await supabase
      .from("insight_run")
      .delete()
      .eq("id", body.insightId);

    if (deleteError) {
      console.error("[delete] Error:", deleteError);
      return NextResponse.json(
        { success: false, error: "Failed to delete insight" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[delete] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete insight" },
      { status: 500 }
    );
  }
});
