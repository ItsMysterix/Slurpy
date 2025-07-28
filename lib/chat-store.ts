// lib/chat-store.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type Sender = "user" | "slurpy"

export interface Message {
  id: string
  content: string
  sender: Sender
  timestamp: string // store as ISO to avoid Date serialization issues
  emotion?: string
  modes?: string[]
}

interface ChatState {
  ownerId: string | null
  sessionId: string | null
  messages: Message[]
  currentModes: string[]
  hasStartedChat: boolean
  isTyping: boolean

  // actions
  setOwner: (userId: string | null) => void
  resetForUser: (userId: string | null) => void
  addMessage: (msg: Omit<Message, "id" | "timestamp"> & { id?: string; timestamp?: string }) => void
  setSessionId: (sid: string | null) => void
  setCurrentModes: (modes: string[]) => void
  setHasStartedChat: (v: boolean) => void
  setIsTyping: (v: boolean) => void
  resetAll: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      sessionId: null,
      messages: [],
      currentModes: ["therapist"],
      hasStartedChat: false,
      isTyping: false,

      setOwner: (userId) => set({ ownerId: userId }),
      resetForUser: (userId) => {
        const { ownerId } = get()
        if (ownerId !== userId) {
          set({
            ownerId: userId,
            sessionId: null,
            messages: [],
            currentModes: ["therapist"],
            hasStartedChat: false,
            isTyping: false,
          })
        }
      },

      addMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: msg.id ?? `${Date.now()}_${Math.random()}`,
              content: msg.content,
              sender: msg.sender,
              emotion: msg.emotion,
              modes: msg.modes,
              timestamp: msg.timestamp ?? new Date().toISOString(),
            },
          ],
        })),

      setSessionId: (sid) => set({ sessionId: sid }),
      setCurrentModes: (modes) => set({ currentModes: modes }),
      setHasStartedChat: (v) => set({ hasStartedChat: v }),
      setIsTyping: (v) => set({ isTyping: v }),

      resetAll: () =>
        set({
          sessionId: null,
          messages: [],
          currentModes: ["therapist"],
          hasStartedChat: false,
          isTyping: false,
        }),
    }),
    {
      name: "slurpy:chat:v1",
      // IMPORTANT: per-tab persistence; clears when the tab/window closes
      storage: createJSONStorage(() => sessionStorage),
      // If you ever want it to survive browser close, switch to:
      // storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
