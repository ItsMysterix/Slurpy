// lib/chat-memory-utils.ts
import { MemoryServiceError, memoryService } from "@/lib/memory-service";

// Thin helpers that delegate creation flows to the server-side MemoryService authority.

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
    const { memory } = await memoryService.createMemoryFromChat({
      userId,
      chatSessionId,
      customSummary,
    });

    return { success: true, memoryId: memory.id };
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      return { success: false, error: error.message };
    }

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
    const { memory } = await memoryService.createMemoryFromJournal({
      userId,
      journalEntryId,
      customSummary,
    });

    return { success: true, memoryId: memory.id };
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      return { success: false, error: error.message };
    }

    console.error("Error creating journal memory:", error);
    return { success: false, error: "Internal error" };
  }
}
