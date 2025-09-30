// components/chat/ModeChangePopup.tsx
"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import type { ModeId } from "@/lib/persona";
import { PERSONA_MODES } from "@/lib/persona";

export default function ModeChangePopup({ modes }: { modes: ModeId[] }) {
  const label = modes
    .map((id) => PERSONA_MODES.find((m) => m.id === id)?.name ?? id)
    .join(" + ");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -20 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 rounded-full grid place-items-center">
          <Bot className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 font-rubik">
          Mode updated to: {label} ✨
        </span>
      </div>
    </motion.div>
  );
}
