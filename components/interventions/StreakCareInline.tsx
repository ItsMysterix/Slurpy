"use client";
import { X } from "lucide-react";

export default function StreakCareInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6 text-center">
          <p className="text-slate-700 dark:text-slate-200">You’re back. That matters. No guilt—just glad you’re here.</p>
          <button onClick={onDone} className="mt-3 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Thanks</button>
        </div>
      </div>
    </div>
  );
}
