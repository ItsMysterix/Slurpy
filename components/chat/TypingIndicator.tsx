"use client";
import React from "react";
import { motion } from "framer-motion";

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl max-w-max"
    >
      <em className="text-xs italic font-rubik text-slate-400 dark:text-slate-400">
        Slurpy is thinking
      </em>

      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-400"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </motion.div>
  );
}
