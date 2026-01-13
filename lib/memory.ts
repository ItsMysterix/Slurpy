// lib/memory.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get user's memories for prompt injection (server-side only)
 * Returns most recent 5 memories for context
 */
export async function getUserMemoriesForContext(
  userId: string,
  isPro: boolean
): Promise<string> {
  // Free users get no memory context
  if (!isPro) {
    return "";
  }

  try {
    const { data, error } = await supabase
      .from("UserMemory")
      .select("summary, sourceType, createdAt")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Failed to fetch memories:", error);
      return "";
    }

    if (!data || data.length === 0) {
      return "";
    }

    // Format memories for prompt context (silent mode - no "I remember" preface)
    const memoryContext = data
      .map((mem) => {
        const sourceLabel = mem.sourceType === "chat" ? "from past conversation" : "from journal";
        const date = new Date(mem.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return `• ${mem.summary} (${sourceLabel}, ${date})`;
      })
      .join("\n");

    return memoryContext;
  } catch (error) {
    console.error("Error fetching memories:", error);
    return "";
  }
}

/**
 * Extract summary from ChatSession.analysis JSONB
 * Parses the analysis object to create a plain-text summary
 */
export function extractSummaryFromAnalysis(analysis: any): string {
  if (!analysis) {
    return "";
  }

  const parts: string[] = [];

  // Extract main emotion
  if (analysis.dominantEmotion) {
    parts.push(`Main feeling: ${analysis.dominantEmotion}`);
  }

  // Extract secondary emotions
  if (analysis.emotions && Array.isArray(analysis.emotions)) {
    const emotionList = analysis.emotions.slice(0, 3).join(", ");
    parts.push(`Also experienced: ${emotionList}`);
  }

  // Extract key topics
  if (analysis.topics && Array.isArray(analysis.topics)) {
    const topicList = analysis.topics.slice(0, 5).join(", ");
    parts.push(`Topics discussed: ${topicList}`);
  }

  // Extract summary text if available
  if (analysis.summary) {
    parts.push(`Summary: ${analysis.summary.slice(0, 200)}`);
  }

  return parts.join(". ") || "";
}
