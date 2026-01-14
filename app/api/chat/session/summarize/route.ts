import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";
import { generateSessionSummary } from "@/lib/session-summary";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

/**
 * POST /api/chat/session/summarize
 * Generate AI summary for a completed chat session
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const userId = auth.userId;

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId required" },
        { status: 400 }
      );
    }

    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("role, content, emotion, topics")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[summarize] Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Get previous summaries for progress tracking
    const { data: previousSessions } = await supabase
      .from("chat_sessions")
      .select("started_at, session_summary, progress_indicators")
      .eq("user_id", userId)
      .not("session_summary", "is", null)
      .lt("started_at", session.started_at)
      .order("started_at", { ascending: false })
      .limit(5);

    // Generate summary
    const summaryResult = await generateSessionSummary({
      messages: messages || [],
      dominantEmotion: session.last_emotion,
      topics: session.topics || [],
      previousSummaries: (previousSessions || []).map(s => ({
        date: new Date(s.started_at).toISOString().split("T")[0],
        summary: s.session_summary || "",
        progressIndicators: s.progress_indicators,
      })),
    });

    // Update session with summary
    const { error: updateError } = await supabase
      .from("chat_sessions")
      .update({
        session_summary: summaryResult.summary,
        key_insights: summaryResult.keyInsights,
        progress_indicators: summaryResult.progressIndicators,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    if (updateError) {
      console.error("[summarize] Error updating session:", updateError);
      return NextResponse.json(
        { error: "Failed to save summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: summaryResult,
    });
  } catch (error) {
    console.error("[summarize] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
