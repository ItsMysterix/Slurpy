// hooks/useMemory.ts
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { UserMemory } from "@/lib/memory-types";

export function useMemory() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMemory = useCallback(
    async (summary: string, sourceType: "chat" | "journal", sourceId: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          throw new Error("Not authenticated");
        }

        const res = await fetch("/api/memory/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            summary,
            sourceType,
            sourceId,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to create memory");
        }

        const data = await res.json();
        return { success: true, memory: data.memory };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteMemory = useCallback(
    async (memoryId: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          throw new Error("Not authenticated");
        }

        const res = await fetch("/api/memory/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ memoryId }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to delete memory");
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createMemory, deleteMemory, loading, error };
}
