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

import { useUser } from "@clerk/nextjs";
import { useChatStore } from "@/lib/chat-store";
import type { ModeId } from "@/lib/persona";
import type { DropIn as OriginalDropIn, DropInKind } from "@/lib/dropins";

// The original type from the library is missing a field we use.
type DropIn = OriginalDropIn & { ttlMs?: number; priority?: number; cooldownKey?: string };

// -------- tiny helpers --------
const CLEAN_OPENERS = [/^\s*got it[.!—-]*\s*/i, /^\s*sure[.!—-]*\s*/i];
function cleanLLMText(t: string) {
  let out = t?.trim() ?? "";
  for (const rx of CLEAN_OPENERS) out = out.replace(rx, "");
  return out;
}

async function sendToSlurpy(text: string, sessionId?: string | null, modes: ModeId[] = []) {
  const roleplayPersona = modes[0] ?? null;
  const res = await fetch("/api/proxy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId, modes, roleplay: roleplayPersona, therapeutic_context: null }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const data = await res.json();
  return {
    session_id: data.session_id || sessionId || Date.now().toString(),
    message: data.message || data.response || "I'm here to help!",
    emotion: data.emotion || "supportive",
    fruit: data.fruit || "🍓",
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

// -------- lightweight client-side drop-in detector --------
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

  // Anger → box breathing / heat release
  if (/(i'm gonna snap|so mad|furious|rage|fuming|pissed)/i.test(text)) {
    const d = add("box-breathing", "anger-breath", "Breathe it down (4–4–4–4)");
    if (d) out.push(d);
  }

  // Anxiety/panic → 5-4-3-2-1 grounding or vagus hum
  if (/(panic|anxious|heart racing|overthinking|can't breathe|spiral)/i.test(text)) {
    const d = add("grounding-54321", "anxiety-ground", "Ground with 5–4–3–2–1");
    if (d) out.push(d);
  }

  // Overwhelm → triage 10-3-1
  if (/(too much|overwhelmed|so many things|don'?t know where to start|idk where to start)/i.test(text)) {
    const d = add("triage-10-3-1", "overwhelm-triage", "Let’s shrink the pile (10→3→1)", { extract: textRaw.slice(0, 400) });
    if (d) out.push(d);
  }

  // Low mood → reach-out + activation
  if (/(empty|down|sad|hopeless|numb)/i.test(text)) {
    const d1 = add("reach-out", "low-reachout", "Nudge a friendly ping?");
    if (d1) out.push(d1);
    const d2 = add("activation-120s", "low-activation", "120-second activation");
    if (d2) out.push(d2);
  }

  // Late-night + arousal → sleep wind-down
  const hour = new Date().getHours();
  if ((hour >= 23 || hour < 5) && /(tired|can't sleep|up late|insomnia|awake since)/i.test(text)) {
    const d = add("sleep-winddown", "sleep-winddown", "2-min wind-down?");
    if (d) out.push(d);
  }

  // Accomplishment → tiny-win capture
  if (/(i did it|finished|shipped|got through|completed|nailed it)/i.test(text)) {
    const d = add("tiny-win", "tiny-win", "Bank the W?");
    if (d) out.push(d);
  }

  // Nervous about event → calendar suggest
  if (/(nervous|anxious) (about|for) (.+?)( tomorrow| next| on | at |$)/i.test(text)) {
    const title = (text.match(/(about|for)\s+(.+?)(?:$|tomorrow|next|on|at)/i)?.[2] || "Important event").trim();
    const d = add("calendar-suggest", "calendar-suggest", "Add this to your calendar?", { defaultTitle: title });
    if (d) out.push(d);
  }

  // Keep max 2, sort by priority
  return out.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 2);
}

const HEADER_H = 64; // px — keep in sync with ChatHeader height

export default function ChatPage() {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [liveText, setLiveText] = React.useState<string | null>(null);

  // mode popup
  const [showModePopup, setShowModePopup] = React.useState(false);
  const [popupModes, setPopupModes] = React.useState<ModeId[]>([]);

  // drop-ins (local; no backend needed)
  const [dropIns, setDropIns] = React.useState<DropIn[]>([]);
  const [cooldowns, setCooldowns] = React.useState<Cooldowns>({});

  // store
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const sessionId = useChatStore((s) => s.sessionId);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const currentModes = useChatStore((s) => s.currentModes);
  const setCurrentModes = useChatStore((s) => s.setCurrentModes);
  const hasStartedChat = useChatStore((s) => s.hasStartedChat);
  const setHasStartedChat = useChatStore((s) => s.setHasStartedChat);
  const resetForUser = useChatStore((s) => s.resetForUser);

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
        .filter((m) => m.sender !== "user" && m.emotion)
        .slice(-3)
        .map((m) => ({ label: m.emotion as string }));
      finalizeSession(sessionId, { lastEmotions: hints });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sessionId, messages]);

  // typewriter then commit to store
  const typewriterCommit = (finalText: string, meta: { emotion?: string; modes?: ModeId[] }) =>
    new Promise<void>((resolve) => {
      const text = cleanLLMText(finalText);
      setLiveText("");
      let i = 0;
      const tick = () => {
        i += Math.max(1, Math.floor(text.length / 80));
        setLiveText(text.slice(0, i));
        if (i < text.length) setTimeout(tick, 18);
        else {
          addMessage({
            id: `${Date.now()}-${Math.random()}`,
            content: text,
            sender: "slurpy",
            timestamp: new Date().toISOString(),
            emotion: meta.emotion,
            modes: meta.modes,
          });
          setLiveText(null);
          resolve();
        }
      };
      tick();
    });

  async function persistMessage(opts: {
    sessionId: string;
    message: string;
    role: "user" | "assistant";
    emotion?: string | null;
    intensity?: number | null;
    topics?: string[];
  }) {
    try {
      await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const data = await sendToSlurpy(textToSend, sid, currentModes);
      await typewriterCommit(data.message, { emotion: data.emotion, modes: data.modes as ModeId[] });
      void persistMessage({
        sessionId: sid,
        message: data.message,
        role: "assistant",
        emotion: data.emotion ?? null,
      });
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

  // ---- Drop-in lifecycle helpers ----
  const enqueueDropIns = React.useCallback((candidates: DropIn[]) => {
    if (!candidates.length) return;
    setDropIns((prev) => {
      // TTL & max 3 visible at once
      const next = [...prev, ...candidates].slice(-3);
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
    // TTL cleanup
    if (!dropIns.length) return;
    const id = window.setInterval(() => {
      const t = now();
      setDropIns((prev) => prev.filter((d) => !d.ttlMs || t - parseInt(d.id.split("-").pop() || "0", 10) < d.ttlMs!));
    }, 10_000);
    return () => window.clearInterval(id);
  }, [dropIns.length]);

  const handleSend = async (messageText?: string) => {
    const textToSend = typeof messageText === "string" ? messageText : input.trim();
    if (!textToSend || isTyping) return;

    // append user message locally
    addMessage({
      id: `${Date.now()}-${Math.random()}`,
      content: textToSend,
      sender: "user",
      timestamp: new Date().toISOString(),
    });
    setInput("");

    // detect + enqueue drop-ins (non-blocking)
    const suggestions = detectDropIns(textToSend, cooldowns);
    enqueueDropIns(suggestions);

    // proceed with normal send
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

  // shared left offset for header + content
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

      {/* Content under header; use inline styles for exact spacing */}
      <div className={contentOffset} style={{ paddingTop: 64 }}>
        <div className="flex transition-all duration-300" style={{ height: `calc(100vh - ${64}px)` }}>
          <div className="flex-1 flex flex-col">
            {/* scrollable message lane */}
            <div className="flex-1 overflow-y-auto px-6">
              {!hasStartedChat ? (
                <div className="max-w-4xl mx-auto text-center h-full grid place-content-center">
                  <h1 className="text-5xl font-display font-light bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 dark:from-slate-400 dark:via-zinc-400 dark:to-stone-400 bg-clip-text text-transparent mb-2">
                    Hello{user?.firstName ? `, ${user.firstName}` : ""}
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
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  {liveText !== null && <LiveBubble text={liveText} />}
                  {isTyping && liveText === null && <TypingIndicator />}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* sticky input inside the page */}
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

      {/* Drop-ins float bottom-right; non-blocking */}
      <DropInRenderer dropIns={dropIns} onDismiss={dismissDropIn} />
    </div>
  );
}
