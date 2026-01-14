import { createServerServiceClient } from "@/lib/supabase/server";
import type { UserMemory } from "@/lib/memory-types";
import { v4 as uuidv4 } from "uuid";
import { canUseMemory, getPlan } from "@/lib/plan-policy";

type PlanHints = { plan?: string; isPro?: boolean };

type PlanCheck = PlanHints & { userId: string };

export class MemoryServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class MemoryService {
  private get supabase() {
    // Lazy to avoid requiring env at import/build time; evaluated only when invoked server-side.
    return createServerServiceClient();
  }

  private async requirePro(options: PlanCheck) {
    if (options.isPro || canUseMemory(options.plan)) {
      return;
    }

    const plan = await this.lookupPlan(options.userId);
    if (canUseMemory(plan)) {
      return;
    }

    throw new MemoryServiceError(
      "Memory feature is only available for Pro and Elite users",
      403
    );
  }

  private async lookupPlan(userId: string): Promise<string | undefined> {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId);
    if (error) {
      console.error("Plan lookup failed:", error);
      return undefined;
    }
    return getPlan(data.user);
  }

  private generateId() {
    return uuidv4();
  }

  private trimSummary(summary: string) {
    return summary.trim().slice(0, 2000);
  }

  private buildChatSummary(analysis: any, customSummary?: string) {
    if (customSummary?.trim()) {
      return this.trimSummary(customSummary);
    }

    if (!analysis) {
      return "";
    }

    const parts: string[] = [];

    if (analysis.dominantEmotion) {
      parts.push(`Main feeling: ${analysis.dominantEmotion}`);
    }

    if (analysis.emotions && Array.isArray(analysis.emotions)) {
      const emotionList = analysis.emotions.slice(0, 3).join(", ");
      if (emotionList) {
        parts.push(`Also experienced: ${emotionList}`);
      }
    }

    if (analysis.topics && Array.isArray(analysis.topics)) {
      const topicList = analysis.topics.slice(0, 5).join(", ");
      if (topicList) {
        parts.push(`Topics discussed: ${topicList}`);
      }
    }

    if (analysis.summary) {
      parts.push(`Summary: ${String(analysis.summary).slice(0, 200)}`);
    }

    return this.trimSummary(parts.join(". "));
  }

  async listMemoriesForContext(options: {
    userId: string;
    plan?: string;
    isPro?: boolean;
    limit?: number;
  }): Promise<{ memories: UserMemory[]; total: number }> {
    await this.requirePro({ userId: options.userId, plan: options.plan, isPro: options.isPro });

    const limit = options.limit ?? 100;
    const { data, error, count } = await this.supabase
      .from("UserMemory")
      .select("*", { count: "exact" })
      .eq("userId", options.userId)
      .order("createdAt", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Memory list error:", error);
      throw new MemoryServiceError("Failed to fetch memories", 500);
    }

    return { memories: data || [], total: count || 0 };
  }

  async createMemoryFromChat(options: {
    userId: string;
    chatSessionId: string;
    customSummary?: string;
    sourceDate?: string;
    plan?: string;
    isPro?: boolean;
  }): Promise<{ memory: UserMemory }> {
    await this.requirePro({ userId: options.userId, plan: options.plan, isPro: options.isPro });

    const { data: session, error: sessionError } = await this.supabase
      .from("ChatSession")
      .select("id, analysis, startTime")
      .eq("id", options.chatSessionId)
      .eq("userId", options.userId)
      .single();

    if (sessionError || !session) {
      throw new MemoryServiceError("Session not found", 404);
    }

    const summary = this.buildChatSummary(session.analysis, options.customSummary);
    if (!summary || summary.length < 10) {
      throw new MemoryServiceError("Summary too short to create memory", 400);
    }

    const { data: memory, error: createError } = await this.supabase
      .from("UserMemory")
      .insert({
        id: this.generateId(),
        userId: options.userId,
        summary: this.trimSummary(summary),
        sourceType: "chat",
        sourceId: options.chatSessionId,
        sourceDate: options.sourceDate || session.startTime,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error("Memory creation error:", createError);
      throw new MemoryServiceError("Failed to create memory", 500);
    }

    return { memory: memory as UserMemory };
  }

  async createMemoryFromJournal(options: {
    userId: string;
    journalEntryId: string;
    customSummary?: string;
    sourceDate?: string;
    plan?: string;
    isPro?: boolean;
  }): Promise<{ memory: UserMemory }> {
    await this.requirePro({ userId: options.userId, plan: options.plan, isPro: options.isPro });

    const { data: entry, error: entryError } = await this.supabase
      .from("JournalEntry")
      .select("id, content, title, date")
      .eq("id", options.journalEntryId)
      .eq("userId", options.userId)
      .single();

    if (entryError || !entry) {
      throw new MemoryServiceError("Journal entry not found", 404);
    }

    let summary = options.customSummary?.trim();
    if (!summary) {
      const contentPreview = entry.content.slice(0, 300);
      summary = `Journal entry: ${entry.title || "Untitled"}. ${contentPreview}${
        entry.content.length > 300 ? "..." : ""
      }`;
    }

    if (!summary || summary.length < 10) {
      throw new MemoryServiceError("Summary too short to create memory", 400);
    }

    const { data: memory, error: createError } = await this.supabase
      .from("UserMemory")
      .insert({
        id: this.generateId(),
        userId: options.userId,
        summary: this.trimSummary(summary),
        sourceType: "journal",
        sourceId: options.journalEntryId,
        sourceDate: options.sourceDate || entry.date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error("Memory creation error:", createError);
      throw new MemoryServiceError("Failed to create memory", 500);
    }

    return { memory: memory as UserMemory };
  }

  async deleteMemory(options: {
    userId: string;
    memoryId: string;
    plan?: string;
    isPro?: boolean;
  }): Promise<void> {
    await this.requirePro({ userId: options.userId, plan: options.plan, isPro: options.isPro });

    const { data: memory } = await this.supabase
      .from("UserMemory")
      .select("id")
      .eq("id", options.memoryId)
      .eq("userId", options.userId)
      .single();

    if (!memory) {
      throw new MemoryServiceError("Memory not found or unauthorized", 404);
    }

    const { error } = await this.supabase
      .from("UserMemory")
      .delete()
      .eq("id", options.memoryId)
      .eq("userId", options.userId);

    if (error) {
      console.error("Memory deletion error:", error);
      throw new MemoryServiceError("Failed to delete memory", 500);
    }
  }
}

export const memoryService = new MemoryService();
