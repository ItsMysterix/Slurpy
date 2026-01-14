// app/api/mcp/stream/route.ts
// Internal MCP-like streaming route for Vercel
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getUserMemoriesForContext } from "@/lib/memory";
import { canUseInsights, getPlan } from "@/lib/plan-policy";

// Minimal NDJSON streaming format: { type: "delta", delta: string, id?: number } ... { type: "done" }
// This implementation uses OpenAI's Chat Completions SSE stream.

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad(500, "Missing OPENAI_API_KEY");

    let body: any = {};
    try {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : {};
    } catch {
      return bad(400, "Bad JSON");
    }
    const user_id = typeof body?.user_id === "string" ? body.user_id : "unknown";
    const text = typeof body?.message === "string" ? body.message : "";
    if (!text) return bad(400, "message is required");

    const controller = new AbortController();
    req.signal?.addEventListener("abort", () => controller.abort());

    const encoder = new TextEncoder();
    let seq = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        try {
          // Fetch user memories for context (silent injection)
          let memoryContext = "";
          if (user_id && user_id !== "unknown") {
            try {
              // Only attempt memory fetch if we have the required environment variables
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              
              if (supabaseUrl && supabaseKey) {
                // Dynamically import to avoid build-time evaluation
                const { createClient } = await import("@supabase/supabase-js");
                const supabase = createClient(supabaseUrl, supabaseKey);
                
                // Check user plan
                const { data: { user } } = await supabase.auth.admin.getUserById(user_id);
                const plan = getPlan(user);

                if (canUseInsights(plan)) {
                  memoryContext = await getUserMemoriesForContext(user_id, true);
                }
              }
            } catch (err) {
              console.error("Failed to fetch memories:", err);
              // Continue without memory if fetch fails
            }
          }

          // Build system prompt with optional memory context
          let systemPrompt = "You are Abby, a deeply empathetic mental health companion. Listen carefully, validate emotions, ask thoughtful follow-up questions. Build genuine connection. Give advice only when asked. Be warm, human, not clinical. Respond with 2-3 paragraphs.";
          
          if (memoryContext) {
            systemPrompt += `\n\nYou have the following context about this person's previous experiences:\n${memoryContext}\n\nUse this context naturally in your responses to show genuine understanding and continuity, but don't explicitly mention that you're referencing memory.`;
          }

          // Use SSE streaming from OpenAI's Chat Completions endpoint
          // gpt-4o-mini is 4x faster than gpt-3.5-turbo with better reasoning
        const res = await Promise.race([
          fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || "gpt-4o-mini",
              stream: true,
              max_completion_tokens: 400,
              temperature: 0.8,
              messages: [
                { 
                  role: "system", 
                  content: systemPrompt
                },
                { role: "user", content: text }
              ],
            }),
            signal: controller.signal,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000))
        ]) as Response;

      if (!res.ok || !res.body) {
        ctrl.enqueue(encoder.encode(JSON.stringify({ type: "error", reason: "upstream" }) + "\n"));
        ctrl.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        try { ctrl.close(); } catch {}
        return;
      }

      const reader = res.body.getReader();
      const textDecoder = new TextDecoder();
      let buffer = "";
      let ended = false;

      const safeEnqueue = (s: string) => {
        if (ended) return;
        try { ctrl.enqueue(encoder.encode(s)); } catch {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += textDecoder.decode(value, { stream: true });
        // Parse SSE lines: lines starting with "data: { ... }"
        while (true) {
          const nl = buffer.indexOf("\n");
          if (nl === -1) break;
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line || !line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            ended = true;
            safeEnqueue(JSON.stringify({ type: "done" }) + "\n");
            try { ctrl.close(); } catch {}
            break;
          }
          try {
            const obj = JSON.parse(payload);
            const delta = String(obj?.choices?.[0]?.delta?.content ?? "");
            if (delta) {
              const out = { type: "delta", delta, id: seq++ };
              safeEnqueue(JSON.stringify(out) + "\n");
            }
          } catch {
            // ignore malformed sse JSON
          }
        }
      }

      if (!ended) {
        safeEnqueue(JSON.stringify({ type: "done" }) + "\n");
        try { ctrl.close(); } catch {}
      }
        } catch (error) {
          console.error("Error in stream start:", error);
          ctrl.enqueue(encoder.encode(JSON.stringify({ type: "error", reason: "internal" }) + "\n"));
          ctrl.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
          try { ctrl.close(); } catch {}
        }
    },
    cancel() {
      controller.abort();
    }
  });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("MCP stream error:", err?.message || err);
    return bad(500, "Internal server error");
  }
}
