"use client";
import { motion } from "framer-motion";
import { FloatingLeaves } from "@/components/floating-leaves";
export default function FloatingSuggestionButtons({ onSuggestionClick }:{ onSuggestionClick:(t:string)=>void }) {
  const suggestions = ["What makes Slurpy special?", "Help me feel better today", "I want to share my thoughts", "Guide me through this challenge"];
  return (
    <div className="relative flex flex-wrap gap-4 justify-center mb-8">
      <div className="absolute inset-0 pointer-events-none"><FloatingLeaves /></div>
      {suggestions.map((s, i)=>(
        <motion.button key={s} onClick={()=>onSuggestionClick(s)}
          className="relative z-10 px-6 py-4 rounded-2xl border border-slate-200/30 dark:border-slate-700/50 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-50/90 dark:hover:bg-slate-700/90 text-slate-700 dark:text-slate-200 text-sm transition-all backdrop-blur-md font-rubik"
          initial={{ opacity: 0, y: 30, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i*.15, duration: .6 }} whileHover={{ scale: 1.05, y: -8 }}>
          {s}
        </motion.button>
      ))}
    </div>
  );
}
