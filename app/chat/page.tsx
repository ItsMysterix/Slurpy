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

import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import BreathingInline from "@/components/interventions/BreathingInline";
import { InterventionCard } from "@/components/interventions/InterventionCard";
import { TITLES, detectState, allowDropIn } from "@/lib/jitai";
import { useChatStore } from "@/lib/chat-store";
import type { ModeId } from "@/lib/persona";

/* tiny helpers */
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
    body: JSON.stringify({
      text,
      session_id: sessionId,
      modes,
      roleplay: roleplayPersona,
      therapeutic_context: null,
    }),
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
  meta: { lastEmotions?: Array<{ label: string; score?: number }> } = {},
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

const HEADER_H = 64; // keep in sync with ChatHeader height

export default function ChatPage() {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [liveText, setLiveText] = React.useState<string | null>(null);

  // JITAI drop-in
  const [drop, setDrop] = React.useState<
    | null
    | { state: "heated" | "anxious" | "foggy" | "meaning"; phase: "offer" | "exercise" }
  >(null);
  const [pendingText, setPendingText] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [lastDropAt, setLastDropAt] = React.useState(0);

  // mode popup
  const [showModePopup, setShowModePopup] = React.useState(false);
  const [popupModes, setPopupModes] = React.useState<ModeId[]>([]);

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
  }, [messages.length, isTyping, liveText, drop]);

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

  // local typewriter then commit to store
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

  const handleSend = async (messageText?: string) => {
    const textToSend = typeof messageText === "string" ? messageText : input.trim();
    if (!textToSend || isTyping) return;

    // cancel any exercise card
    if (drop) {
      setDrop(null);
      setPendingText(null);
      setPaused(false);
    }

    addMessage({
      id: `${Date.now()}-${Math.random()}`,
      content: textToSend,
      sender: "user",
      timestamp: new Date().toISOString(),
    });
    setInput("");

    // just-in-time intervention
    const state = detectState(textToSend);
    const now = Date.now();
    const cool = !lastDropAt || now - lastDropAt > 30_000;
    if (state && (state === "anxious" || state === "heated") && cool && allowDropIn()) {
      setDrop({ state, phase: "offer" });
      setPendingText(textToSend);
      setLastDropAt(now);
      return;
    }

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

  const startExercise = () => drop && setDrop({ ...drop, phase: "exercise" });
  const skipExercise = async () => {
    const t = pendingText;
    setDrop(null);
    setPendingText(null);
    if (t) await proceedSend(t);
  };
  const finishExercise = async () => {
    const t = pendingText;
    setDrop(null);
    setPendingText(null);
    await typewriterCommit("nice. what feels 1% lighter right now?", { modes: [] });
    if (t) await proceedSend(t);
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

      {/* Push content below header and keep total height = viewport - header */}
      <div className={`pt-[${HEADER_H}px] ${contentOffset}`}>
        <div className={`flex h-[calc(100vh-${HEADER_H}px)] transition-all duration-300`}>
          <div className="flex-1 flex flex-col">
            {/* scrollable message lane */}
            <div className="flex-1 overflow-y-auto px-6">
              {!hasStartedChat ? (
                <div className="max-w-4xl mx-auto text-center h-full grid place-content-center">
                  <h1 className="text-5xl font-display font-light bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 dark:from-slate-400 dark:via-zinc-400 dark:to-stone-400 bg-clip-text text-transparent mb-2">
                    Hello{user?.firstName ? `, ${user.firstName}` : ""}
                  </h1>
                  <p className="text-xl text-slate-600 dark:text-slate-300 font-light">
                    I'm Slurpy, your mindful AI companion
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

                  {drop?.phase === "offer" && (
                    <div className="flex justify-start mb-6">
                      <div className="max-w-[560px] w-full">
                        <InterventionCard
                          title={TITLES[drop.state]}
                          subtitle="Noticed intense language—want a 60-sec reset right here?"
                          onStart={startExercise}
                          onSkip={skipExercise}
                        />
                      </div>
                    </div>
                  )}

                  {drop?.phase === "exercise" && (
                    <div className="flex justify-start mb-6">
                      <div className="relative max-w-[720px] w-full rounded-2xl overflow-hidden">
                        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-3 h-8 bg-slate-200/50 dark:bg-slate-800/60 backdrop-blur border border-slate-300/40 dark:border-slate-700/60"
                            onClick={() => setPaused((p) => !p)}
                          >
                            {paused ? "Resume" : "Pause"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-3 h-8 bg-slate-200/50 dark:bg-slate-800/60 backdrop-blur border border-slate-300/40 dark:border-slate-700/60"
                            onClick={finishExercise}
                            title="Close"
                          >
                            Close
                          </Button>
                        </div>
                        <BreathingInline
                          onDone={() => {
                            void finishExercise();
                          }}
                          onCancel={() => {
                            void skipExercise();
                          }}
                          seconds={60}
                        />
                      </div>
                    </div>
                  )}

                  {isTyping && liveText === null && <TypingIndicator />}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* sticky input within page, with subtle background + border */}
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
    </div>
  );
}
