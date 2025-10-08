"use client";
import { useEffect, useState } from "react";
import { X, AudioLines } from "lucide-react";

export default function VagusHumInline({
  onDone, onCancel, seconds = 30,
}: { onDone: () => void; onCancel: () => void; seconds?: number }) {
  const [t, setT] = useState(seconds);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { if (t <= 0) onDone(); }, [t, onDone]);

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Stop" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 text-center space-y-2">
          <div className="inline-flex items-center gap-2 justify-center text-slate-700 dark:text-slate-200">
            <AudioLines className="w-4 h-4" /> Vagus Nerve Reset (Humming)
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Time left</div>
          <div className="text-3xl font-semibold">{t}s</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Hum on exhale like a fridge. Feel chest buzz.</p>
        </div>
      </div>
    </div>
  );
}
