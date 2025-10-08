"use client";

import { useEffect, useState } from "react";
import { X, Timer } from "lucide-react";

const options = ["Water", "Stretch", "Inbox-1"] as const;

export default function MicroBreakInline({
  onDone,
  onCancel,
  seconds = 60,
}: {
  onDone: (choice?: string) => void;
  onCancel: () => void;
  seconds?: number;
}) {
  const [t, setT] = useState(seconds);
  const [choice, setChoice] = useState<string | null>(options[0]);

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { if (t <= 0) onDone(choice || undefined); }, [t, choice, onDone]);

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button
          aria-label="Stop"
          onClick={onCancel}
          className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-1 flex items-center justify-center gap-2">
            <Timer className="w-4 h-4" /> 60-second micro-activation
          </div>
          <div className="text-3xl font-semibold">{t}s</div>

          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => setChoice(opt)}
                className={`px-3 py-1.5 rounded-lg border ${
                  choice === opt
                    ? "bg-sage-600 text-white border-sage-700"
                    : "hover:bg-sage-50/60 dark:hover:bg-slate-800/60"
                }`}
                aria-pressed={choice === opt}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-center gap-3">
            <button onClick={() => onDone(choice || undefined)} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700">
              Done
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
