// components/chat/ChatInput.tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Send } from "lucide-react";
import type { ModeId } from "@/lib/persona";
import { PERSONA_MODES } from "@/lib/persona";

function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="bg-gradient-to-r from-slate-600 via-zinc-600 to-stone-600 hover:from-slate-700 hover:via-zinc-700 hover:to-stone-700 dark:from-slate-700 dark:via-zinc-700 dark:to-stone-700 dark:hover:from-slate-800 dark:hover:via-zinc-800 dark:hover:to-stone-800 text-white rounded-lg w-10 h-10 flex-shrink-0 disabled:opacity-50 transition-all duration-200 border-0 p-0 flex items-center justify-center shadow-md"
    >
      <Send className="w-4 h-4" />
    </Button>
  );
}

export default function ChatInput({
  input,
  setInput,
  isTyping,
  handleSend,
  onKeyDown,
  currentModes,
  onModesChange,
}: {
  input: string;
  setInput: (v: string) => void;
  isTyping: boolean;
  handleSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  currentModes: ModeId[];
  onModesChange: (m: ModeId[]) => void;
}) {
  const [modesOpen, setModesOpen] = React.useState(false);

  const toggleMode = (modeId: ModeId) => {
    const exists = currentModes.includes(modeId);
    const next = exists ? (currentModes.filter((m) => m !== modeId) as ModeId[]) : ([...currentModes, modeId] as ModeId[]);
    onModesChange(next);
  };

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
                onChange={(e) => setInput(e.target.value)}
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
                  <motion.div
                    className="flex gap-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {PERSONA_MODES.map((mode) => (
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
  );
}
