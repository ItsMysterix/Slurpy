"use client"

import type React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { useChatStore, type Message } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { User, Send, Sun, Moon, Plus, Pause, Play, X, Bot } from "lucide-react"
import { useTheme } from "next-themes"
import { useUser } from "@clerk/nextjs"
import { FloatingLeaves } from "@/components/floating-leaves"
import SlideDrawer from "@/components/slide-drawer"
import { detectState, allowDropIn, TITLES } from "@/lib/jitai"
import { InterventionCard } from "@/components/interventions/InterventionCard"
import BreathingInline from "@/components/interventions/BreathingInline"

/* ------------------------------------------------------------------ */
/* 🎭 Enhanced Personality Modes with Therapeutic Depth               */
/* ------------------------------------------------------------------ */
const PERSONALITY_MODES = [
  { id: "therapist", emoji: "🧘", name: "Therapist", description: "evidence-based, validating, emotionally curious", color: "from-slate-400 to-slate-500", prompt_style: "Use CBT and humanistic therapy techniques. Ask open-ended questions, reflect emotions, validate experiences, and guide gentle exploration of feelings and thoughts." },
  { id: "coach",     emoji: "🥊", name: "Coach",     description: "solution-focused, motivating, action-oriented",   color: "from-zinc-400 to-zinc-500",  prompt_style: "Focus on strengths, set actionable goals, provide encouragement, and help break down challenges into manageable steps." },
  { id: "friend",    emoji: "🧑‍🤝‍🧑", name: "Friend",    description: "casual, empathetic, relatable",                color: "from-stone-400 to-stone-500", prompt_style: "Be warm and relatable, share appropriate experiences, use casual language while being genuinely supportive." },
  { id: "poet",      emoji: "🎭", name: "Poet",      description: "metaphorical, aesthetic, emotionally rich",       color: "from-gray-400 to-gray-500",  prompt_style: "Use metaphors, imagery, and poetic language to help reframe experiences and find beauty in struggle." },
  { id: "monk",      emoji: "🧙", name: "Monk",      description: "mindful, philosophical, grounded",                color: "from-neutral-400 to-neutral-500", prompt_style: "Offer mindfulness techniques, philosophical perspectives, and grounding practices for finding inner peace." },
  { id: "lover",     emoji: "❤️", name: "Lover",     description: "compassionate, nurturing, heart-centered",       color: "from-slate-500 to-zinc-500",  prompt_style: "Provide deep emotional support, focus on self-love and healing, speak from the heart with unconditional acceptance." },
]

/* ------------------------------------------------------------------ */
/* 🔌 Model call helper                                               */
/* ------------------------------------------------------------------ */
async function sendToSlurpy(
  text: string,
  sessionId?: string | null,
  modes: string[] = [],
): Promise<{
  session_id: string
  message: string
  emotion: string
  fruit: string
  modes: string[]
}> {
  let enhancedPrompt = text
  if (modes.includes("therapist")) {
    enhancedPrompt = `
Context: You are a skilled, warm therapist having a session with a client. Use evidence-based therapeutic techniques.

Core Principles:
- Ask open-ended questions to explore deeper
- Reflect emotions back to validate feelings
- Normalize their experience without minimizing
- Invite elaboration gently: "Can you tell me more about..."
- Use active listening: "It sounds like..." "I'm hearing that..."
- Avoid generic comfort phrases or quick fixes
- Create psychological safety for vulnerability

Client message: "${text}"

Respond as a therapist would - with curiosity, validation, and gentle exploration. Ask follow-up questions that help them process their feelings.`
  }

  const res = await fetch("/api/proxy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: enhancedPrompt,
      session_id: sessionId,
      modes,
      therapeutic_context: modes.includes("therapist")
        ? {
            style: "evidence_based_therapy",
            techniques: ["active_listening", "validation", "open_ended_questions", "emotional_reflection"],
            avoid: ["generic_comfort", "quick_fixes", "advice_giving"],
          }
        : null,
    }),
  })

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Backend error ${res.status}: ${details}`)
  }

  const data = await res.json()
  return {
    session_id: data.session_id || sessionId || Date.now().toString(),
    message: data.message || data.response || "I'm here to help!",
    emotion: data.emotion || "supportive",
    fruit: data.fruit || "🍓",
    modes,
  }
}

/* ------------------------------------------------------------------ */
/* 🧾 Persist each message for Insights                               */
/* ------------------------------------------------------------------ */
async function persistMessage(opts: {
  sessionId: string
  message: string
  role: "user" | "assistant"
  emotion?: string | null
  intensity?: number | null
  topics?: string[]
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
    })
  } catch (e) {
    console.warn("persistMessage failed:", e)
  }
}

/* ------------------------------------------------------------------ */
/* Theme Toggle (hydration-safe)                                      */
/* ------------------------------------------------------------------ */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300 dark:text-slate-400 dark:hover:text-slate-300 p-2 rounded-lg transition-colors opacity-0">
        <Sun className="w-5 h-5" />
      </Button>
    )
  }
  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-slate-600 hover:text-slate-500 dark:text-slate-400 dark:hover:text-slate-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

/* ------------------------------------------------------------------ */
function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 hover:from-slate-700 hover:via-zinc-700 hover:to-stone-700 dark:from-slate-700 dark:via-zinc-700 dark:to-stone-700 dark:hover:from-slate-800 dark:hover:via-zinc-800 dark:hover:to-stone-800 text-white rounded-lg w-10 h-10 flex-shrink-0 disabled:opacity-50 transition-all duration-200 border-0 p-0 flex items-center justify-center shadow-md"
    >
      <Send className="w-4 h-4" />
    </Button>
  )
}

/* ------------------------------------------------------------------ */
function FloatingSuggestionButtons({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = ["What makes Slurpy special?", "Help me feel better today", "I want to share my thoughts", "Guide me through this challenge"]
  return (
    <div className="relative flex flex-wrap gap-4 justify-center mb-8">
      <div className="absolute inset-0 pointer-events-none">
        <FloatingLeaves />
      </div>
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
          className="relative z-10 px-6 py-4 rounded-2xl border border-slate-200/30 dark:border-slate-700/50 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-50/90 dark:hover:bg-slate-700/90 text-slate-700 dark:text-slate-200 text-sm transition-all duration-300 hover:border-slate-300/50 dark:hover:border-slate-600/70 hover:shadow-xl backdrop-blur-md font-rubik"
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: index * 0.15, duration: 0.6 }}
          whileHover={{ scale: 1.05, y: -8, transition: { duration: 0.2 } }}
          whileTap={{ scale: 0.95 }}
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl max-w-20">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="w-2 h-2 bg-slate-400 dark:bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Number.POSITIVE_INFINITY, delay: i * 0.2 }} />
      ))}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Mode Change Popup Component */
/* ------------------------------------------------------------------ */
function ModeChangePopup({ modes }: { modes: string[] }) {
  const modeNames = modes.map((id) => PERSONALITY_MODES.find((m) => m.id === id)?.name).join(" + ")
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -20 }}
      className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 rounded-full flex items-center justify-center">
          <Bot className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 font-rubik">
          Mode updated to: {modeNames} ✨
        </span>
      </div>
    </motion.div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const { user } = useUser()
  const isUser = message.sender === "user"

  const getSlurpyDisplay = () => {
    // Always use Bot icon instead of emojis
    return <Bot className="w-4 h-4 text-white" />
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-6`}>
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 flex-shrink-0 rounded-full flex items-center justify-center shadow-lg">
          {getSlurpyDisplay()}
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-100 backdrop-blur-sm"
              : "bg-slate-50/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 backdrop-blur-sm"
          }`}
        >
          <p className="font-rubik leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-xs text-slate-400 dark:text-slate-400 font-rubik">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && message.modes && message.modes.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-400 font-rubik">
              • {message.modes.map((id) => PERSONALITY_MODES.find((m) => m.id === id)?.name).join(" + ")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-zinc-400 via-stone-400 to-slate-400 dark:from-zinc-500 dark:via-stone-500 dark:to-slate-500 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-lg">
          {user?.imageUrl ? <img src={user.imageUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-white" />}
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
function ChatInputArea({
  input, setInput, isTyping, handleSend, onKeyDown, currentModes, onModesChange,
}: {
  input: string
  setInput: (value: string) => void
  isTyping: boolean
  handleSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  currentModes: string[]
  onModesChange: (modes: string[]) => void
}) {
  const [modesOpen, setModesOpen] = useState(false)

  const toggleMode = (modeId: string) => {
    const newModes = currentModes.includes(modeId)
      ? currentModes.filter((id) => id !== modeId)
      : [...currentModes, modeId]
    onModesChange(newModes)
  }

  return (
    <div className="px-6 pb-6 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/50 dark:via-slate-700/50 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-100/20 dark:from-slate-900/20 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="bg-white/95 dark:bg-slate-800/95 rounded-2xl p-4 backdrop-blur-xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type your message..."
                className="w-full resize-none bg-transparent focus:ring-0 focus:outline-none font-rubik text-slate-700 dark:text-slate-200 placeholder:text-slate-400/70 dark:placeholder:text-slate-500/70 min-h-[40px] max-h-32 border-0 text-base"
                rows={1}
                disabled={isTyping}
              />
            </div>
            <SendButton onClick={handleSend} disabled={!input.trim() || isTyping} />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 overflow-hidden">
              <AnimatePresence>
                {modesOpen && (
                  <motion.div className="flex gap-2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                    {PERSONALITY_MODES.map((mode) => (
                      <motion.button
                        key={mode.id}
                        onClick={() => toggleMode(mode.id)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`h-10 px-4 rounded-lg flex items-center transition-all duration-200 whitespace-nowrap font-rubik ${
                          currentModes.includes(mode.id)
                            ? "bg-gradient-to-r from-slate-200 via-zinc-200 to-stone-200 dark:from-slate-700 dark:via-zinc-700 dark:to-stone-700 text-slate-800 dark:text-slate-200 shadow-md"
                            : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span className="text-sm font-medium">{mode.name}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              onClick={() => setModesOpen(!modesOpen)}
              variant="outline"
              className="w-10 h-10 flex-shrink-0 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 p-0 border-slate-200 dark:border-slate-600"
            >
              <motion.div animate={{ rotate: modesOpen ? -45 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
                <Plus className="w-4 h-4" />
              </motion.div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const CLEAN_OPENERS = [/^\s*got it[.!—-]*\s*/i, /^\s*sure[.!—-]*\s*/i]
function cleanLLMText(text: string) {
  let out = text?.trim() ?? ""
  for (const rx of CLEAN_OPENERS) out = out.replace(rx, "")
  return out
}

/* A small live ("typewriter") bubble kept outside the store */
function LiveBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 justify-start mb-6">
      <div className="w-8 h-8 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 rounded-full flex items-center justify-center shadow-lg">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="max-w-[80%] flex flex-col items-start">
        <div className="px-4 py-3 rounded-2xl bg-slate-50/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 backdrop-blur-sm">
          <p className="font-rubik leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main Component – uses Zustand store                                */
/* ------------------------------------------------------------------ */
export default function SlurpyChatPage() {
  const { user } = useUser()
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Drop-in state
  const [drop, setDrop] = useState<null | { state: "heated" | "anxious" | "foggy" | "meaning"; phase: "offer" | "exercise" }>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [lastDropAt, setLastDropAt] = useState<number>(0) // cooldown

  // Local live typewriter bubble
  const [liveText, setLiveText] = useState<string | null>(null)

  // Mode change popup state
  const [showModePopup, setShowModePopup] = useState(false)
  const [popupModes, setPopupModes] = useState<string[]>([])

  // Zustand store
  const messages = useChatStore((s) => s.messages)
  const addMessage = useChatStore((s) => s.addMessage)
  const sessionId = useChatStore((s) => s.sessionId)
  const setSessionId = useChatStore((s) => s.setSessionId)
  const currentModes = useChatStore((s) => s.currentModes)
  const setCurrentModes = useChatStore((s) => s.setCurrentModes)
  const hasStartedChat = useChatStore((s) => s.hasStartedChat)
  const setHasStartedChat = useChatStore((s) => s.setHasStartedChat)
  const resetForUser = useChatStore((s) => s.resetForUser)

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, isTyping, drop, liveText])

  // Reset session on user switch
  useEffect(() => {
    resetForUser(user?.id ?? null)
  }, [user?.id, resetForUser])

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    handleSend(suggestion)
  }

  const handleModesChange = (newModes: string[]) => {
    setCurrentModes(newModes)
    if (hasStartedChat && newModes.length > 0) {
      // Show popup instead of adding message to chat
      setPopupModes(newModes)
      setShowModePopup(true)
      
      // Auto-hide after 4 seconds
      setTimeout(() => {
        setShowModePopup(false)
      }, 4000)
    }
  }

  // Typewriter that stays local, then commits a final message to the store
  const typewriterCommit = (finalText: string, meta: { emotion?: string; modes?: string[] }) =>
    new Promise<void>((resolve) => {
      const text = cleanLLMText(finalText)
      setLiveText("") // show live bubble
      let i = 0
      const tick = () => {
        i += Math.max(1, Math.floor(text.length / 80)) // faster for longer text
        setLiveText(text.slice(0, i))
        if (i < text.length) {
          setTimeout(tick, 18) // ~55 cps
        } else {
          // commit to store
          addMessage({
            id: `${Date.now()}-${Math.random()}`,
            content: text,
            sender: "slurpy",
            timestamp: new Date().toISOString(),
            emotion: meta.emotion,
            modes: meta.modes,
          })
          setLiveText(null)
          resolve()
        }
      }
      tick()
    })

  // Proceed to send (used after skip/finish)
  const proceedSend = async (textToSend: string) => {
    if (!hasStartedChat) setHasStartedChat(true)

    // Stable session id
    const sid =
      sessionId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    if (!sessionId) setSessionId(sid)

    // Auto-support mode if empty
    const supportKeywords = ["help me", "feel better", "sad", "depressed", "anxious", "stressed", "tired", "overwhelmed", "angry", "mad", "furious"]
    const needsSupport = typeof textToSend === "string" && supportKeywords.some((k) => textToSend.toLowerCase().includes(k))
    let modesToUse = currentModes
    if (currentModes.length === 0 && needsSupport) {
      modesToUse = ["friend"]
      setCurrentModes(["friend"])
    }

    setIsTyping(true)

    // Persist user message (non-blocking)
    void persistMessage({ sessionId: sid, message: textToSend, role: "user" })

    try {
      const data = await sendToSlurpy(textToSend, sid, modesToUse)

      // Typewriter live bubble, then commit final message
      await typewriterCommit(data.message, { emotion: data.emotion, modes: data.modes })

      // Persist assistant (best effort)
      void persistMessage({ sessionId: sid, message: data.message, role: "assistant", emotion: data.emotion ?? null })
    } catch (err) {
      console.error(err)
      addMessage({
        id: `${Date.now()}-${Math.random()}`,
        content: "⚠️ Sorry, I had trouble connecting. Please try again.",
        sender: "slurpy",
        timestamp: new Date().toISOString(),
        modes: currentModes,
      })
    } finally {
      setIsTyping(false)
    }
  }

  const handleSend = async (messageText?: string) => {
    const textToSend = typeof messageText === "string" ? messageText : input.trim()
    if (!textToSend || isTyping) return

    // If card is up and user sends a new message → cancel it
    if (drop) {
      setDrop(null)
      setPendingText(null)
      setPaused(false)
    }

    // Render the user bubble immediately
    addMessage({
      id: `${Date.now()}-${Math.random()}`,
      content: textToSend,
      sender: "user",
      timestamp: new Date().toISOString(),
    })
    setInput("")

    // JITAI detection for anxiety & anger lanes with short cooldown
    const state = detectState(textToSend) // "anxious" | "heated" | ...
    const COOLDOWN_MS = 30_000
    const now = Date.now()
    const dropAllowedLocally = !lastDropAt || now - lastDropAt > COOLDOWN_MS
    if (state && (state === "anxious" || state === "heated") && dropAllowedLocally && allowDropIn()) {
      setDrop({ state, phase: "offer" })
      setPendingText(textToSend)
      setLastDropAt(now)
      // Do NOT call the model yet — wait for Start or Skip
      return
    }

    // Otherwise proceed normally
    await proceedSend(textToSend)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Offer handlers
  const startExercise = () => {
    if (!drop) return
    setDrop({ ...drop, phase: "exercise" })
  }
  const skipExercise = async () => {
    const text = pendingText
    setDrop(null)
    setPendingText(null)
    if (text) await proceedSend(text)
  }
  const finishExercise = async () => {
    const text = pendingText
    setDrop(null)
    setPendingText(null)
    // brief check-in from assistant, then send original
    await typewriterCommit("nice. what feels 1% lighter right now?", { modes: ["therapist"] })
    if (text) await proceedSend(text)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-zinc-25 to-stone-50 dark:from-slate-950 dark:via-zinc-900 dark:to-stone-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      
      {/* Mode Change Popup */}
      <AnimatePresence>
        {showModePopup && (
          <ModeChangePopup modes={popupModes} />
        )}
      </AnimatePresence>

      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm border-b border-slate-100/50 dark:border-slate-800/50">
            <motion.h2 className={`text-2xl font-display font-medium text-slate-700 dark:text-slate-200 transition-all duration-300 ${sidebarOpen ? "ml-8" : "ml-4"}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              Slurpy
            </motion.h2>
            <ThemeToggle />
          </div>

          {/* Main content — left aligned lane (not centered) */}
          <div className="flex-1 flex flex-col justify-start px-6 overflow-hidden">
            {!hasStartedChat ? (
              <div className="max-w-4xl mx-auto text-center my-auto">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-4">
                  <h1 className="text-5xl font-display font-light bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 dark:from-slate-400 dark:via-zinc-400 dark:to-stone-400 bg-clip-text text-transparent mb-2">
                    Hello{user?.firstName ? `, ${user.firstName}` : ""}
                  </h1>
                  <p className="text-xl text-slate-600 dark:text-slate-300 font-light">I'm Slurpy, your mindful AI companion</p>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-12">
                  <FloatingSuggestionButtons onSuggestionClick={handleSuggestionClick} />
                </motion.div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pb-4 rounded-2xl">
                <div className="max-w-4xl mx-auto py-6">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}

                  {/* Live typewriter bubble */}
                  {liveText !== null && <LiveBubble text={liveText} />}

                  {/* Offer card – aligned with assistant lane */}
                  {drop && drop.phase === "offer" && (
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

                  {/* Exercise — top-left controls, same alignment */}
                  {drop && drop.phase === "exercise" && (
                    <div className="flex justify-start mb-6">
                      <div className="relative max-w-[720px] w-full rounded-2xl overflow-hidden">
                        {/* top-left controls */}
                        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-3 h-8 bg-slate-200/50 dark:bg-slate-800/60 backdrop-blur border border-slate-300/40 dark:border-slate-700/60"
                            onClick={() => setPaused((p) => !p)}
                          >
                            {paused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
                            {paused ? "Resume" : "Pause"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-3 h-8 bg-slate-200/50 dark:bg-slate-800/60 backdrop-blur border border-slate-300/40 dark:border-slate-700/60"
                            onClick={finishExercise}
                            title="Close"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* exercise content */}
                        <BreathingInline
                          onDone={() => { void finishExercise() }}
                          onCancel={() => { void skipExercise() }}
                          seconds={60}
                        />
                      </div>
                    </div>
                  )}

                  <AnimatePresence>{isTyping && liveText === null && <TypingIndicator />}</AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <ChatInputArea
            input={input}
            setInput={setInput}
            isTyping={isTyping}
            handleSend={handleSend}
            onKeyDown={onKeyDown}
            currentModes={currentModes}
            onModesChange={handleModesChange}
          />
        </div>
      </div>
    </div>
  )
}