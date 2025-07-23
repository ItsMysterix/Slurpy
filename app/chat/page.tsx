"use client"

import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import SlideDrawer from "@/components/slide-drawer"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useRef, useEffect } from "react"
import { Bot, User, Send, BarChart3 } from "lucide-react"
import { v4 as uuid } from "uuid"

/* ------------------------------------------------------------------ */
/* 🔌 helper to call proxy‑chat                                        */
/* ------------------------------------------------------------------ */
async function sendToSlurpy(
  text: string,
  sessionId?: string | null
): Promise<{
  session_id: string
  message: string
  emotion: string
  fruit: string
}> {
  const res = await fetch("/api/proxy-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId }),
  })

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Backend error ${res.status}: ${details}`)
  }
  return res.json()
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
  intensity?: number
}

/* ------------------------------------------------------------------ */
/* Tiny components                                                     */
/* ------------------------------------------------------------------ */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 px-4 py-3 bg-sage-100 rounded-2xl max-w-20"
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-sage-400 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </motion.div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.sender === "user"
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-sage-400 to-sage-500 flex-shrink-0 rounded-full flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-white border border-clay-400/40 text-sage-600"
              : "bg-sage-100 text-sage-800"
          }`}
        >
          <p className="font-display leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        <span className="text-xs text-sage-400 mt-1 px-2">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-clay-400 to-sage-300 flex-shrink-0 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uuid(),
      content:
        "Hello! I'm Slurpy, your AI companion. I'm here to listen and support you. How are you feeling today?",
      sender: "slurpy",
      timestamp: new Date(),
    },
  ])

  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  /* auto‑scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  /* send */
  async function handleSend() {
    if (!input.trim() || isTyping) return

    const userMsg: Message = {
      id: uuid(),
      content: input.trim(),
      sender: "user",
      timestamp: new Date(),
    }
    setMessages((m) => [...m, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const data = await sendToSlurpy(userMsg.content, sessionId)

      /* store session id from backend once */
      if (!sessionId) setSessionId(data.session_id)

      const botMsg: Message = {
        id: uuid(),
        content: data.message,
        sender: "slurpy",
        timestamp: new Date(),
        emotion: data.emotion,
      }
      setMessages((m) => [...m, botMsg])
    } catch (err) {
      console.error(err)
      setMessages((m) => [
        ...m,
        {
          id: uuid(),
          content: "⚠️ Sorry, I had trouble reaching the server. Please try again.",
          sender: "slurpy",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  /* ENTER shortcut */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-sand-50 bg-gradient-to-tr from-sand-50 via-sage-50 to-transparent">
      {/* 🟪 your SlideDrawer & insights code stays unchanged */}
      <SlideDrawer /* …props */ />

      {/* Chat area */}
      <div className="flex h-screen">
        <div className="flex-1 flex flex-col">
          {/* messages */}
          <div className="flex-1 overflow-y-auto px-6 pb-32">
            <div className="max-w-4xl mx-auto py-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* input */}
          <div className="sticky bottom-0 bg-sand-50/90 backdrop-blur-lg border-t border-sand-200 px-6 py-4">
            <div className="max-w-4xl mx-auto flex gap-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Share what's on your mind…"
                className="flex-1 resize-none bg-transparent border-sand-200 focus:ring-sage-300 focus:border-sage-300 rounded-xl min-h-[44px] max-h-32 font-display py-3"
                rows={1}
                disabled={isTyping}
              />

              <Button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl px-4 py-2 h-11 flex-shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
