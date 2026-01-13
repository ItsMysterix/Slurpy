// lib/chat-memory-utils.ts
import { extractSummaryFromAnalysis } from "@/lib/memory";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Create a memory from a chat session (server-side only)
 * Useful for after chat sessions end
 */
export async function createChatSessionMemory(
  userId: string,
  chatSessionId: string,
  customSummary?: string
): Promise<{ success: boolean; memoryId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the chat session
    const { data: session, error: sessionError } = await supabase
      .from("ChatSession")
      .select("id, analysis, startTime")
      .eq("id", chatSessionId)
      .eq("userId", userId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    // Extract summary from analysis or use custom summary
    const summary =
      customSummary || extractSummaryFromAnalysis(session.analysis) || "Conversation summary";

    if (!summary || summary.length < 10) {
      return { success: false, error: "Summary too short to create memory" };
    }

    // Create memory record
    const { data: memory, error: createError } = await supabase
      .from("UserMemory")
      .insert({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId,
        summary: summary.slice(0, 2000),
        sourceType: "chat",
        sourceId: chatSessionId,
        sourceDate: session.startTime,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError) {
      console.error("Memory creation error:", createError);
      return { success: false, error: "Failed to create memory" };
    }

    return { success: true, memoryId: memory.id };
  } catch (error) {
    console.error("Error creating chat memory:", error);
    return { success: false, error: "Internal error" };
  }
}

/**
 * Create a memory from a journal entry (server-side only)
 * Called when user marks a journal entry as memory source
 */
export async function createJournalEntryMemory(
  userId: string,
  journalEntryId: string,
  customSummary?: string
): Promise<{ success: boolean; memoryId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the journal entry
    const { data: entry, error: entryError } = await supabase
      .from("JournalEntry")
      .select("id, content, title, date")
      .eq("id", journalEntryId)
      .eq("userId", userId)
      .single();

    if (entryError || !entry) {
      return { success: false, error: "Journal entry not found" };
    }

    // Use custom summary or create from content
    let summary = customSummary;
    if (!summary) {
      const contentPreview = entry.content.slice(0, 300);
      summary = `Journal entry: ${entry.title || "Untitled"}. ${contentPreview}${entry.content.length > 300 ? "..." : ""}`;
    }

    if (!summary || summary.length < 10) {
      return { success: false, error: "Summary too short to create memory" };
    }

    // Create memory record
    const { data: memory, error: createError } = await supabase
      .from("UserMemory")
      .insert({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId,
        summary: summary.slice(0, 2000),
        sourceType: "journal",
        sourceId: journalEntryId,
        sourceDate: entry.date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError) {
      console.error("Memory creation error:", createError);
      return { success: false, error: "Failed to create memory" };
    }

    return { success: true, memoryId: memory.id };
  } catch (error) {
    console.error("Error creating journal memory:", error);
    return { success: false, error: "Internal error" };
  }
}
