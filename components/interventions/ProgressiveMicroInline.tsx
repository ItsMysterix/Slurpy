"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STEPS = [
  "Feet + calves: clench 5s, release 10s",
  "Thighs + glutes: clench 5s, release 10s",
  "Abs + lower back: clench 5s, release 10s",
  "Hands + forearms: clench 5s, release 10s",
  "Shoulders + jaw: clench 5s, release 10s",
];

export default function ProgressiveMicroInline({
  onDone, onCancel, seconds = 60,
}: { onDone: () => void; onCancel: () => void; seconds?: number }) {
  const [t, setT] = useState(seconds);
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (t <= 0) onDone();
    else if (t % 12 === 0 && i < STEPS.length - 1) setI(i + 1);
  }, [t, i, onDone]);

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Stop" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">Time left</div>
          <div className="text-3xl font-semibold">{t}s</div>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{STEPS[i]}</p>
        </div>
      </div>
    </div>
  );
}
