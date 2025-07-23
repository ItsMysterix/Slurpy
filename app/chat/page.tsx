"use client"

import type React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { User, Send, Sun, Moon, Plus, X } from "lucide-react"
import { useTheme } from "next-themes"
import { useUser } from "@clerk/nextjs"
import SlideDrawer from "@/components/slide-drawer"

/* ------------------------------------------------------------------ */
/* 🎭 Enhanced Personality Modes with Therapeutic Depth              */
/* ------------------------------------------------------------------ */
const PERSONALITY_MODES = [
  {
    id: "therapist",
    emoji: "🧘",
    name: "Therapist",
    description: "evidence-based, validating, emotionally curious",
    color: "from-sage-400 to-sage-500",
    prompt_style: "Use CBT and humanistic therapy techniques. Ask open-ended questions, reflect emotions, validate experiences, and guide gentle exploration of feelings and thoughts."
  },
  {
    id: "coach",
    emoji: "🥊",
    name: "Coach",
    description: "solution-focused, motivating, action-oriented",
    color: "from-clay-400 to-clay-500",
    prompt_style: "Focus on strengths, set actionable goals, provide encouragement, and help break down challenges into manageable steps."
  },
  {
    id: "friend",
    emoji: "🧑‍🤝‍🧑",
    name: "Friend",
    description: "casual, empathetic, relatable",
    color: "from-sand-400 to-sand-500",
    prompt_style: "Be warm and relatable, share appropriate experiences, use casual language while being genuinely supportive."
  },
  {
    id: "poet",
    emoji: "🎭",
    name: "Poet",
    description: "metaphorical, aesthetic, emotionally rich",
    color: "from-sage-500 to-clay-400",
    prompt_style: "Use metaphors, imagery, and poetic language to help reframe experiences and find beauty in struggle."
  },
  {
    id: "monk",
    emoji: "🧙",
    name: "Monk",
    description: "mindful, philosophical, grounded",
    color: "from-sand-500 to-sage-400",
    prompt_style: "Offer mindfulness techniques, philosophical perspectives, and grounding practices for finding inner peace."
  },
  {
    id: "lover",
    emoji: "❤️",
    name: "Lover",
    description: "compassionate, nurturing, heart-centered",
    color: "from-clay-500 to-sage-500",
    prompt_style: "Provide deep emotional support, focus on self-love and healing, speak from the heart with unconditional acceptance."
  },
]

/* ------------------------------------------------------------------ */
/* 🔌 Real API Helper with Enhanced Therapeutic Prompting            */
/* ------------------------------------------------------------------ */
async function sendToSlurpy(
  text: string,
  sessionId?: string | null,
  modes: string[] = []
): Promise<{
  session_id: string
  message: string
  emotion: string
  fruit: string
  modes: string[]
}> {
  // Enhanced prompt engineering for therapeutic responses
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
      modes: modes,
      therapeutic_context: modes.includes("therapist") ? {
        style: "evidence_based_therapy",
        techniques: ["active_listening", "validation", "open_ended_questions", "emotional_reflection"],
        avoid: ["generic_comfort", "quick_fixes", "advice_giving"]
      } : null
    })
  })

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Backend error ${res.status}: ${details}`)
  }
  
  const data = await res.json()
  
  // Return in expected format
  return {
    session_id: data.session_id || sessionId || Date.now().toString(),
    message: data.message || data.response || "I'm here to help!",
    emotion: data.emotion || "supportive",
    fruit: data.fruit || "🍓",
    modes: modes
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
interface Message {
  id: string
  content: string
  sender: "user" | "slurpy"
  timestamp: Date
  emotion?: string
  modes?: string[]
}

/* ------------------------------------------------------------------ */
/* Theme Toggle Component - Fixed Hydration                          */
/* ------------------------------------------------------------------ */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors opacity-0"
      >
        <Sun className="w-5 h-5" />
      </Button>
    )
  }

  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/* Send Button Component - Enhanced Dark Theme                       */
/* ------------------------------------------------------------------ */
function SendButton({ 
  onClick, 
  disabled 
}: { 
  onClick: () => void
  disabled: boolean 
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 hover:from-sage-700 hover:via-clay-700 hover:to-sand-700 dark:from-sage-700 dark:via-clay-700 dark:to-sand-700 dark:hover:from-sage-800 dark:hover:via-clay-800 dark:hover:to-sand-800 text-white rounded-lg w-10 h-10 flex-shrink-0 disabled:opacity-50 transition-all duration-200 border-0 p-0 flex items-center justify-center shadow-md"
    >
      <Send className="w-4 h-4" />
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/* Suggestion Buttons                                                 */
/* ------------------------------------------------------------------ */
function SuggestionButtons({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    "What makes Slurpy special?",
    "Help me feel better today",
    "I want to share my thoughts",
    "Guide me through this challenge",
  ]

  return (
    <div className="flex flex-wrap gap-3 justify-center mb-8">
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
          className="px-5 py-3 rounded-2xl border border-clay-200/60 dark:border-gray-600/60 bg-gradient-to-r from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-800/70 dark:via-gray-750/50 dark:to-gray-800/70 hover:from-sage-50/80 hover:via-clay-50/60 hover:to-sand-50/80 dark:hover:from-gray-700/80 dark:hover:via-gray-650/60 dark:hover:to-gray-700/80 text-clay-700 dark:text-sand-200 text-sm transition-all duration-300 hover:border-sage-300/80 dark:hover:border-sand-500/80 hover:shadow-lg backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Message Components                                                 */
/* ------------------------------------------------------------------ */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 px-4 py-3 bg-sand-100 dark:bg-gray-800 rounded-2xl max-w-20"
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-clay-400 dark:bg-sand-400 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.2,
          }}
        />
      ))}
    </motion.div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const { user } = useUser()
  const isUser = message.sender === "user"

  const getSlurpyDisplay = () => {
    if (!message.modes || message.modes.length === 0) return "🤖"
    if (message.modes.length === 1) {
      return PERSONALITY_MODES.find((m) => m.id === message.modes![0])?.emoji || "🤖"
    }
    return message.modes.map((id) => PERSONALITY_MODES.find((m) => m.id === id)?.emoji).join("")
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-sage-400 via-clay-400 to-sand-400 dark:from-sage-500 dark:via-clay-500 dark:to-sand-500 flex-shrink-0 rounded-full flex items-center justify-center shadow-lg">
          <span className="text-sm">{getSlurpyDisplay()}</span>
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-white dark:bg-gray-800 text-clay-700 dark:text-sand-100"
              : "bg-sand-50 dark:bg-gray-900 text-clay-800 dark:text-sand-100"
          }`}
        >
          <p className="font-display leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-xs text-clay-400 dark:text-sand-400">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && message.modes && message.modes.length > 0 && (
            <span className="text-xs text-clay-400 dark:text-sand-400">
              • {message.modes.map((id) => PERSONALITY_MODES.find((m) => m.id === id)?.name).join(" + ")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-clay-400 via-sand-400 to-sage-400 dark:from-clay-500 dark:via-sand-500 dark:to-sage-500 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-lg">
          {user?.imageUrl ? (
            <img 
              src={user.imageUrl} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-4 h-4 text-white" />
          )}
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Chat Input Area Component - Claude Style                          */
/* ------------------------------------------------------------------ */
function ChatInputArea({
  input,
  setInput,
  isTyping,
  handleSend,
  onKeyDown,
  currentModes,
  onModesChange,
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
    <div className="px-6 pb-6">
      <div className="max-w-4xl mx-auto">
        {/* Single Layer - Clean Input Container */}
        <div className="bg-gradient-to-br from-sand-50/60 via-white/80 to-sage-50/60 dark:from-gray-800/60 dark:via-gray-750/80 dark:to-gray-800/60 rounded-2xl p-4 backdrop-blur-sm">
          
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type your message..."
                className="w-full resize-none bg-transparent focus:ring-0 focus:outline-none font-display text-clay-700 dark:text-sand-300 placeholder:text-clay-400/70 dark:placeholder:text-sand-500/70 min-h-[40px] max-h-32 border-0 text-base"
                rows={1}
                disabled={isTyping}
              />
            </div>
            
            <SendButton 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            />
          </div>

          {/* Mode Selection Row - Enhanced with Animation */}
          <div className="flex items-center gap-2">
            {/* Horizontal sliding personality cards */}
            <div className="flex items-center gap-2 flex-1 overflow-hidden">
              <AnimatePresence>
                {modesOpen && (
                  <motion.div
                    className="flex gap-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {PERSONALITY_MODES.map((mode, index) => (
                      <motion.button
                        key={mode.id}
                        onClick={() => toggleMode(mode.id)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ 
                          opacity: 1, 
                          y: 0,
                          rotate: [0, 1, -1, 0], // Floating leaf animation
                        }}
                        transition={{ 
                          delay: index * 0.1,
                          duration: 0.4,
                          rotate: {
                            duration: 2 + index * 0.3,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }
                        }}
                        className={`h-10 px-4 rounded-lg flex items-center transition-all duration-200 whitespace-nowrap ${
                          currentModes.includes(mode.id)
                            ? "bg-gradient-to-r from-sage-200 via-clay-200 to-sand-200 dark:from-sage-700 dark:via-clay-700 dark:to-sand-700 text-clay-800 dark:text-sand-200 shadow-md"
                            : "bg-sand-100 dark:bg-gray-700 hover:bg-sage-50 dark:hover:bg-gray-600 text-clay-700 dark:text-sand-300"
                        }`}
                      >
                        <span className="font-display text-sm font-semibold">{mode.name}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Plus/X Toggle Button - No gap with last mode */}
            <Button
              onClick={() => setModesOpen(!modesOpen)}
              variant="outline"
              className="w-10 h-10 flex-shrink-0 rounded-lg bg-sand-100 dark:bg-gray-700 hover:bg-sage-200 dark:hover:bg-gray-600 text-clay-600 dark:text-sand-300 p-0 border-0"
            >
              <motion.div 
                animate={{ rotate: modesOpen ? -45 : 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
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
/* Main Component - Slurpy Layout                                    */
/* ------------------------------------------------------------------ */
export default function SlurpyChatPage() {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentModes, setCurrentModes] = useState<string[]>(["therapist"])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    handleSend(suggestion)
  }

  const handleModesChange = (newModes: string[]) => {
    setCurrentModes(newModes)
    if (hasStartedChat && newModes.length > 0) {
      const modeNames = newModes.map((id) => PERSONALITY_MODES.find((m) => m.id === id)?.name).join(" + ")
      const systemMsg: Message = {
        id: Date.now().toString() + Math.random(),
        content: `Personality updated to: ${modeNames} ✨`,
        sender: "slurpy",
        timestamp: new Date(),
        modes: newModes,
      }
      setMessages((m) => [...m, systemMsg])
    }
  }

  const handleSend = async (messageText?: string) => {
    // Ensure we're working with a string, not an event object
    const textToSend = typeof messageText === 'string' ? messageText : input.trim()
    if (!textToSend || isTyping) return

    if (!hasStartedChat) {
      setHasStartedChat(true)
    }

    // Auto-select Friend mode if no modes selected and user needs support
    const supportKeywords = ['help me', 'feel better', 'sad', 'depressed', 'anxious', 'stressed', 'tired', 'overwhelmed']
    const needsSupport = typeof textToSend === 'string' && supportKeywords.some(keyword => textToSend.toLowerCase().includes(keyword))
    
    let modesToUse = currentModes
    if (currentModes.length === 0 && needsSupport) {
      modesToUse = ["friend"]
      setCurrentModes(["friend"])
    }

    const userMsg: Message = {
      id: Date.now().toString() + Math.random(),
      content: textToSend,
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((m) => [...m, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const data = await sendToSlurpy(textToSend, sessionId, modesToUse)
      if (!sessionId) setSessionId(data.session_id)

      const botMsg: Message = {
        id: Date.now().toString() + Math.random(),
        content: data.message,
        sender: "slurpy",
        timestamp: new Date(),
        emotion: data.emotion,
        modes: data.modes,
      }

      setMessages((m) => [...m, botMsg])
    } catch (err) {
      console.error(err)
      setMessages((m) => [
        ...m,
        {
          id: Date.now().toString() + Math.random(),
          content: "⚠️ Sorry, I had trouble connecting. Please try again.",
          sender: "slurpy",
          timestamp: new Date(),
          modes: modesToUse,
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header with Slurpy title and theme toggle */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
            <motion.h2
              className={`text-2xl font-display font-medium text-clay-700 dark:text-sand-200 transition-all duration-300 ${sidebarOpen ? "ml-8" : "ml-4"}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              Slurpy
            </motion.h2>
            <ThemeToggle />
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col justify-center px-6 overflow-hidden">
            {!hasStartedChat ? (
              /* Welcome Screen - Slurpy Style */
              <div className="max-w-4xl mx-auto text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="mb-4"
                >
                  <h1 className="text-5xl font-display font-light bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 dark:from-sage-400 dark:via-clay-400 dark:to-sand-400 bg-clip-text text-transparent mb-2">
                    Hello{user?.firstName ? `, ${user.firstName}` : ''}
                  </h1>
                  <p className="text-xl text-clay-600 dark:text-sand-300 font-light">
                    I'm Slurpy, your empathetic AI companion
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="mb-12"
                >
                  <SuggestionButtons onSuggestionClick={handleSuggestionClick} />
                </motion.div>
              </div>
            ) : (
              /* Chat Messages */
              <div className="flex-1 overflow-y-auto pb-4 rounded-2xl">
                <div className="max-w-4xl mx-auto py-6">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>
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
