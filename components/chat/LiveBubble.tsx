"use client";
import { Bot } from "lucide-react";
export default function LiveBubble({ text }:{ text:string }) {
  return (
    <div className="flex gap-3 justify-start mb-6">
      <div className="w-8 h-8 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 rounded-full grid place-items-center shadow-lg">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="max-w-[80%] flex flex-col items-start">
        <div className="px-4 py-3 rounded-2xl bg-slate-50/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 backdrop-blur-sm">
          <p className="font-rubik whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    </div>
  );
}
