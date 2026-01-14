// app/chat/page.tsx
"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import SlideDrawer from "@/components/slide-drawer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageBubble from "@/components/chat/MessageBubble";
import ChatInput from "@/components/chat/ChatInput";
import TypingIndicator from "@/components/chat/TypingIndicator";
import ModeChangePopup from "@/components/chat/ModeChangePopup";
import FloatingSuggestionButtons from "@/components/chat/FloatingSuggestions";
import LiveBubble from "@/components/chat/LiveBubble";
import DropInRenderer from "@/components/chat/DropInRenderer";

import { useUser } from "@/lib/auth-hooks";
import { supabase } from "@/lib/supabaseClient";
import { useChatStore, type Message as ChatMessage } from "@/lib/chat-store";
import type { ModeId } from "@/lib/persona";
import type { DropIn as OriginalDropIn, DropInKind } from "@/lib/dropins";

// Extend with local optional fields
type DropIn = OriginalDropIn & { ttlMs?: number; priority?: number; cooldownKey?: string };

// ---- tiny helpers ----
const CLEAN_OPENERS = [/^\s*got it[.!—-]*\s*/i, /^\s*sure[.!—-]*\s*/i];
function cleanLLMText(t: string) {
  let out = t?.trim() ?? "";
  for (const rx of CLEAN_OPENERS) out = out.replace(rx, "");
  return out;
}

// Streaming chat to reduce latency: uses NDJSON frames from /api/proxy-chat-stream
async function streamFromSlurpy(
  text: string,
  sessionId?: string | null,
  modes: ModeId[] = [],
  onDelta?: (delta: string) => void,
): Promise<{ session_id: string; message: string; emotion?: string; modes: ModeId[] }> {
  const roleplayPersona = modes[0] ?? null;
  // Attach Supabase access token so Next API can forward it to backend
  let bearer = "";
  try {
    const { data } = await supabase.auth.getSession();
    bearer = data.session?.access_token || "";
  } catch {}
  const res = await fetch("/api/proxy-chat-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(typeof document !== "undefined"
        ? (() => {
            const m = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
            const t = m ? decodeURIComponent(m[1]) : "";
            return t ? { "x-csrf": t } as Record<string, string> : {};
          })()
        : {}),
    },
    body: JSON.stringify({ text, session_id: sessionId, mode: roleplayPersona ?? undefined }),
  });
  if (!res.ok || !res.body) {
    let errorDetails = `Backend ${res.status}`;
    try {
      const errData = await res.json();
      errorDetails = errData.error || errData.message || errorDetails;
      if (errData.details) {
        console.error('[Chat] Backend error details:', errData.details);
      }
    } catch {}
    throw new Error(errorDetails);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  // Fallback emotion if backend emits one later; optional
  let emotion: string | undefined;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n");
        while (idx !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.trim()) {
            try {
              const evt = JSON.parse(line);
              if (evt?.type === "delta") {
                const d = String(evt.delta || "");
                assembled += d;
                onDelta?.(assembled);
              } else if (evt?.type === "start") {
                // If upstream includes emotions array, pick top label as coarse emotion
                const top = Array.isArray(evt.emotions) && evt.emotions[0] && typeof evt.emotions[0].label === "string"
                  ? String(evt.emotions[0].label)
                  : undefined;
                if (top) emotion = top;
                
                // Log RAG pipeline metadata for verification
                if (evt.source === "rag_pipeline") {
                  console.log("✅ RAG Pipeline Active - Response generated with:", {
                    source: evt.source,
                    model: evt.model,
                    emotion: evt.emotion,
                  });
                }
              } else if (evt?.type === "error") {
                throw new Error("stream_error");
              } else if (evt?.type === "done") {
                idx = -1; // break outer while after flushing
                break;
              }
            } catch {
              // ignore malformed JSON lines
            }
          }
          idx = buffer.indexOf("\n");
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  const finalText = assembled.trim() || "I'm here to help!";
  
  // Detect backend errors disguised as responses
  if (finalText.includes("proxy error:") || finalText.includes("pipeline error:") || finalText.includes("Unable to connect")) {
    throw new Error(finalText);
  }
  
  return {
    session_id: sessionId || Date.now().toString(),
    message: finalText,
    emotion,
    modes: modes as ModeId[],
  };
}

function finalizeSession(
  sessionId: string,
  meta: { lastEmotions?: Array<{ label: string; score?: number }> } = {}
) {
  try {
    const payload = JSON.stringify({
      sessionId,
      hints: meta.lastEmotions ?? [],
      endedAt: new Date().toISOString(),
    });
    if ("sendBeacon" in navigator) {
      navigator.sendBeacon("/api/insights/finalize", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/insights/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {}
}

// ---- client-side drop-in detector ----
type Cooldowns = Record<string, number>;
const now = () => Date.now();
const within = (ms: number, last?: number) => (last ? now() - last < ms : false);

function detectDropIns(textRaw: string, cooldowns: Cooldowns): DropIn[] {
  const text = (textRaw || "").toLowerCase();
  const add = (
    kind: DropInKind,
    cooldownKey: string,
    title?: string,
    meta?: Record<string, any>,
    ttlMs = 180_000,
    priority = 50
  ): DropIn | null => {
    if (within(5 * 60_000, cooldowns[cooldownKey])) return null; // 5 min per-key cooldown
    return { id: `${cooldownKey}-${now()}`, kind, title: title ?? "", meta, ttlMs, priority, cooldownKey };
  };

  const out: DropIn[] = [];

  // Anger
  if (/(i'm gonna snap|so mad|furious|rage|fuming|pissed)/i.test(text)) {
    const d = add("box-breathing", "anger-breath", "Breathe it down (4–4–4–4)");
    if (d) out.push(d);
  }

  // Anxiety / panic
  if (/(panic|anxious|heart racing|overthinking|can't breathe|spiral)/i.test(text)) {
    const d = add("grounding-54321", "anxiety-ground", "Ground with 5–4–3–2–1");
    if (d) out.push(d);
  }

  // Overwhelm
  if (/(too much|overwhelmed|so many things|don'?t know where to start|idk where to start)/i.test(text)) {
    const d = add("triage-10-3-1", "overwhelm-triage", "Let’s shrink the pile (10→3→1)", { extract: textRaw.slice(0, 400) });
    if (d) out.push(d);
  }

  // Low mood
  if (/(empty|down|sad|hopeless|numb)/i.test(text)) {
    const d1 = add("reach-out", "low-reachout", "Nudge a friendly ping?");
    if (d1) out.push(d1);
    const d2 = add("activation-120s", "low-activation", "120-second activation");
    if (d2) out.push(d2);
  }

  // Late night wind-down
  const hour = new Date().getHours();
  if ((hour >= 23 || hour < 5) && /(tired|can't sleep|up late|insomnia|awake since)/i.test(text)) {
    const d = add("sleep-winddown", "sleep-winddown", "2-min wind-down?");
    if (d) out.push(d);
  }

  // Celebration
  if (/(i did it|finished|shipped|got through|completed|nailed it)/i.test(text)) {
    const d = add("tiny-win", "tiny-win", "Bank the W?");
    if (d) out.push(d);
  }

  // Calendar suggestion
  if (/(nervous|anxious) (about|for) (.+?)( tomorrow| next| on | at |$)/i.test(text)) {
    const title = (text.match(/(about|for)\s+(.+?)(?:$|tomorrow|next|on|at)/i)?.[2] || "Important event").trim();
    const d = add("calendar-suggest", "calendar-suggest", "Add this to your calendar?", { defaultTitle: title });
    if (d) out.push(d);
  }

  return out.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 2);
}

const HEADER_H = 64;

export default function ChatPage() {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [liveText, setLiveText] = React.useState<string | null>(null);

  // mode popup
  const [showModePopup, setShowModePopup] = React.useState(false);
  const [popupModes, setPopupModes] = React.useState<ModeId[]>([]);

  // drop-ins
  const [dropIns, setDropIns] = React.useState<DropIn[]>([]);
  const [cooldowns, setCooldowns] = React.useState<Cooldowns>({});

  // store
  const messages = useChatStore((s: any) => s.messages);
  const addMessage = useChatStore((s: any) => s.addMessage);
  const sessionId = useChatStore((s: any) => s.sessionId);
  const setSessionId = useChatStore((s: any) => s.setSessionId);
  const currentModes = useChatStore((s: any) => s.currentModes);
  const setCurrentModes = useChatStore((s: any) => s.setCurrentModes);
  const hasStartedChat = useChatStore((s: any) => s.hasStartedChat);
  const setHasStartedChat = useChatStore((s: any) => s.setHasStartedChat);
  const resetForUser = useChatStore((s: any) => s.resetForUser);

  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping, liveText, dropIns.length]);

  // reset thread on user switch
  React.useEffect(() => {
    resetForUser(user?.id ?? null);
  }, [user?.id, resetForUser]);

  // finalize session on unload
  React.useEffect(() => {
    if (!sessionId) return;
    const handler = () => {
      const hints = messages
        .filter((m: ChatMessage) => m.sender !== "user" && !!m.emotion)
        .slice(-3)
        .map((m: ChatMessage) => ({ label: m.emotion as string }));
      finalizeSession(sessionId, { lastEmotions: hints });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sessionId, messages]);

  // Commit streamed text into the transcript
  function commitStreamedText(finalText: string, meta: { emotion?: string; modes?: ModeId[] }) {
    const text = cleanLLMText(finalText);
    addMessage({
      id: `${Date.now()}-${Math.random()}`,
      content: text,
      sender: "slurpy",
      timestamp: new Date().toISOString(),
      emotion: meta.emotion,
      modes: meta.modes,
    });
    setLiveText(null);
  }

  async function persistMessage(opts: {
    sessionId: string;
    message: string;
    role: "user" | "assistant";
    emotion?: string | null;
    intensity?: number | null;
    topics?: string[];
  }) {
    try {
      let bearer = "";
      try {
        const { data } = await supabase.auth.getSession();
        bearer = data.session?.access_token || "";
      } catch {}
      await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify({
          sessionId: opts.sessionId,
          message: opts.message,
          role: opts.role,
          emotion: opts.emotion ?? null,
          intensity: typeof opts.intensity === "number" ? Math.min(1, Math.max(0, opts.intensity)) : null,
          topics: Array.isArray(opts.topics) ? opts.topics : [],
        }),
      });
    } catch {}
  }

  const proceedSend = async (textToSend: string) => {
    if (!hasStartedChat) setHasStartedChat(true);
    const sid = sessionId ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    if (!sessionId) setSessionId(sid);

    setIsTyping(true);
    void persistMessage({ sessionId: sid, message: textToSend, role: "user" });

    try {
      // Live stream render — keep spinner until first token arrives
      const data = await streamFromSlurpy(
        textToSend,
        sid,
        currentModes,
        (assembled) => setLiveText(cleanLLMText(assembled)),
      );
      commitStreamedText(data.message, { emotion: data.emotion, modes: data.modes as ModeId[] });
      void persistMessage({ sessionId: sid, message: data.message, role: "assistant", emotion: data.emotion ?? null });
    } catch {
      addMessage({
        id: `${Date.now()}-${Math.random()}`,
        content: "⚠️ Sorry, I had trouble connecting. Please try again.",
        sender: "slurpy",
        timestamp: new Date().toISOString(),
        modes: currentModes,
      });
    } finally {
      setIsTyping(false);
    }
  };

  // ---- Drop-in lifecycle ----
  const enqueueDropIns = React.useCallback((candidates: DropIn[]) => {
    if (!candidates.length) return;
    setDropIns((prev) => {
      const next = [...prev, ...candidates].slice(-3); // cap visible
      return next;
    });
    setCooldowns((prev) => {
      const updates: Cooldowns = { ...prev };
      for (const c of candidates) {
        if (c.cooldownKey) updates[c.cooldownKey] = now();
      }
      return updates;
    });
  }, []);

  const dismissDropIn = React.useCallback((id: string) => {
    setDropIns((prev) => prev.filter((d) => d.id !== id));
  }, []);

  React.useEffect(() => {
    if (!dropIns.length) return;
    const id = window.setInterval(() => {
      const t = now();
      setDropIns((prev) =>
        prev.filter((d) => {
          if (!d.ttlMs) return true;
          const ts = parseInt(d.id.split("-").pop() || "0", 10);
          return t - ts < d.ttlMs;
        })
      );
    }, 10_000);
    return () => window.clearInterval(id);
  }, [dropIns.length]);

  const handleSend = async (messageText?: string) => {
    const textToSend = typeof messageText === "string" ? messageText : input.trim();
    if (!textToSend || isTyping) return;

    addMessage({
      id: `${Date.now()}-${Math.random()}`,
      content: textToSend,
      sender: "user",
      timestamp: new Date().toISOString(),
    });
    setInput("");

    // detect + enqueue (non-blocking)
    const suggestions = detectDropIns(textToSend, cooldowns);
    enqueueDropIns(suggestions);

    await proceedSend(textToSend);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // mode change handler → triggers popup
  const onModesChange = (m: ModeId[]) => {
    setCurrentModes(m);
    if (hasStartedChat && m.length > 0) {
      setPopupModes(m);
      setShowModePopup(true);
      window.setTimeout(() => setShowModePopup(false), 4000);
    }
  };

  const contentOffset = sidebarOpen ? "ml-64" : "ml-16";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-zinc-25 to-stone-50 dark:from-slate-950 dark:via-zinc-900 dark:to-stone-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />

      {/* Fixed header aligned with sidebar width */}
      <div className={`fixed top-0 left-0 right-0 z-40 ${contentOffset}`}>
        <ChatHeader title="Slurpy" sidebarOpen={sidebarOpen} />
      </div>

      {/* Mode-change toast */}
      <AnimatePresence>{showModePopup && <ModeChangePopup modes={popupModes} />}</AnimatePresence>

      {/* Content under header */}
      <div className={contentOffset} style={{ paddingTop: HEADER_H }}>
        <div className="flex transition-all duration-300" style={{ height: `calc(100vh - ${HEADER_H}px)` }}>
          <div className="flex-1 flex flex-col">
            {/* scrollable message lane */}
            <div className="flex-1 overflow-y-auto px-6">
              {!hasStartedChat ? (
                <div className="max-w-4xl mx-auto text-center h-full grid place-content-center">
                  <h1 className="text-5xl font-display font-light bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 dark:from-slate-400 dark:via-zinc-400 dark:to-stone-400 bg-clip-text text-transparent mb-2">
                    {(() => {
                      const m: any = (user?.user_metadata as any) || {};
                      const username = m?.username || m?.user_name;
                      const full = m?.name || m?.full_name;
                      const gn = m?.given_name, fn = m?.family_name;
                      const email = user?.email;
                      const name = username || full || [gn, fn].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "");
                      return `Hello${name ? `, ${name}` : ""}`;
                    })()}
                  </h1>
                  <p className="text-xl text-slate-600 dark:text-slate-300 font-light">
                    I&apos;m Slurpy, your mindful AI companion
                  </p>
                  <div className="mt-6">
                    <FloatingSuggestionButtons
                      onSuggestionClick={(s) => {
                        setInput(s);
                        void handleSend(s);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto py-6">
                  {messages.map((m: ChatMessage) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}

                  {/* Render interventions as part of the thread */}
                  <div className="flex justify-start mb-4">
                    <div className="max-w-[620px] w-full">
                      <DropInRenderer dropIns={dropIns} onDismiss={dismissDropIn} />
                    </div>
                  </div>

                  {liveText !== null && <LiveBubble text={liveText} />}
                  {isTyping && liveText === null && <TypingIndicator />}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* sticky input */}
            <div className="px-6">
              <div className="sticky bottom-0 z-30 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-slate-50/40 rounded-t-2xl">
                <ChatInput
                  input={input}
                  setInput={setInput}
                  isTyping={isTyping}
                  handleSend={() => void handleSend()}
                  onKeyDown={onKeyDown}
                  currentModes={currentModes}
                  onModesChange={onModesChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* No floating renderer anymore; everything is inline */}
    </div>
  );
}
