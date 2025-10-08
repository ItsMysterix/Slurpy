"use client";

import { useEffect, useState, useRef } from "react";
import { X, Pause, Play, RotateCcw } from "lucide-react";

export default function Focus25Inline({
  onDone,
  onCancel,
  seconds = 25 * 60,
}: {
  onDone: () => void;
  onCancel: () => void;
  seconds?: number;
}) {
  const [remain, setRemain] = useState(seconds);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => setRemain((s) => s - 1), 1000) as unknown as number;
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [running]);

  useEffect(() => {
    if (remain <= 0) { setRunning(false); onDone(); }
  }, [remain, onDone]);

  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");

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
          <div className="text-sm text-slate-500 dark:text-slate-400">Focus bubble • Pomodoro</div>
          <div className="mt-2 text-4xl font-semibold tracking-wider">{mm}:{ss}</div>
          <p className="mt-2 text-slate-600 dark:text-slate-300">One small target only. Notifications off.</p>

          <div className="mt-5 flex items-center justify-center gap-3">
            <button onClick={() => setRunning((r) => !r)} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700 flex items-center gap-2">
              {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {running ? "Pause" : "Start"}
            </button>
            <button
              onClick={() => { setRemain(seconds); setRunning(false); }}
              className="px-4 py-2 rounded-lg border flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <button onClick={onDone} className="px-4 py-2 rounded-lg border">Finish</button>
          </div>
        </div>
      </div>
    </div>
  );
}
