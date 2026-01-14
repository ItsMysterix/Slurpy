// components/memory/MemoryManager.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@/lib/auth-hooks";
import { supabase } from "@/lib/supabaseClient";
import { usePlan } from "@/lib/use-plan";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UserMemory } from "@/lib/memory-types";

export function MemoryManager() {
  const { user } = useUser();
  const { isPro } = usePlan();
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isPro) {
      setIsLoading(false);
      return;
    }

    fetchMemories();
  }, [user, isPro]);

  async function fetchMemories() {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch("/api/memory/list", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch memories");
      }

      const data = await res.json();
      setMemories(data.memories || []);
      setError(null);
    } catch (err) {
      console.error("Fetch memories error:", err);
      setError("Could not load memories");
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteMemory(memoryId: string) {
    try {
      setIsDeleting(memoryId);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setError("Not authenticated");
        return;
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
        throw new Error("Failed to delete memory");
      }

      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (err) {
      console.error("Delete memory error:", err);
      setError("Could not delete memory");
    } finally {
      setIsDeleting(null);
    }
  }

  if (!isPro) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle>Memory Feature</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">
          Memory is available for Pro and Elite users. Upgrade your plan to create and manage memories from your conversations and journal.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Memories</CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Explicit memories you've created from conversations and journal entries.
          Abby uses these to provide more personalized support.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading memories...
          </div>
        ) : memories.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            No memories yet. Create memories from conversations or journal entries to help Abby understand you better.
          </p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-gray-800">{memory.summary}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {memory.sourceType === "chat" ? "From conversation" : "From journal"} •{" "}
                      {new Date(memory.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMemory(memory.id)}
                    disabled={isDeleting === memory.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    {isDeleting === memory.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {memories.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-gray-600"
            onClick={fetchMemories}
            disabled={isLoading}
          >
            Refresh
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
