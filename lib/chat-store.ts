// lib/chat-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ModeId } from "@/lib/persona";

export type Sender = "user" | "slurpy";

export interface Message {
  id: string;
  content: string;
  sender: Sender;
  timestamp: string; // ISO
  emotion?: string;
  modes?: ModeId[];
}

interface ChatState {
  ownerId: string | null;
  sessionId: string | null;
  messages: Message[];
  currentModes: ModeId[];
  hasStartedChat: boolean;
  isTyping: boolean;

  setOwner: (userId: string | null) => void;
  resetForUser: (userId: string | null) => void;
  addMessage: (msg: Omit<Message, "id" | "timestamp"> & { id?: string; timestamp?: string }) => void;
  setSessionId: (sid: string | null) => void;
  setCurrentModes: (modes: ModeId[]) => void;
  setHasStartedChat: (v: boolean) => void;
  setIsTyping: (v: boolean) => void;
  updateMessage: (
    id: string,
    patch: Partial<Omit<Message, "id" | "timestamp">> & { content?: string }
  ) => void;
  resetAll: () => void;
}

// Local helper types to satisfy strict typing without relying on zustand's generics
type SetStatePartial = (
  partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>),
  replace?: boolean
) => void;
type GetStateFn = () => ChatState;

export const useChatStore = create<ChatState>()(
  persist(
    (set: SetStatePartial, get: GetStateFn) => ({
      ownerId: null,
      sessionId: null,
      messages: [],
      currentModes: ["self_compassion"], // default
      hasStartedChat: false,
      isTyping: false,

  setOwner: (userId: string | null) => set({ ownerId: userId }),

      resetForUser: (userId: string | null) => {
        const { ownerId } = get();
        if (ownerId !== userId) {
          set({
            ownerId: userId,
            sessionId: null,
            messages: [],
            currentModes: ["self_compassion"],
            hasStartedChat: false,
            isTyping: false,
          });
        }
      },

      addMessage: (msg: Omit<Message, "id" | "timestamp"> & { id?: string; timestamp?: string }) =>
        set((s: ChatState) => ({
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

      setSessionId: (sid: string | null) => set({ sessionId: sid }),
      setCurrentModes: (modes: ModeId[]) => set({ currentModes: modes }),
      setHasStartedChat: (v: boolean) => set({ hasStartedChat: v }),
      setIsTyping: (v: boolean) => set({ isTyping: v }),

      updateMessage: (
        id: string,
        patch: Partial<Omit<Message, "id" | "timestamp">> & { content?: string }
      ) =>
        set((s: ChatState) => ({
          messages: s.messages.map((m: Message) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      resetAll: () =>
        set({
          sessionId: null,
          messages: [],
          currentModes: ["self_compassion"],
          hasStartedChat: false,
          isTyping: false,
        }),
    }),
    {
      name: "slurpy:chat:v1",
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
    }
  )
);
