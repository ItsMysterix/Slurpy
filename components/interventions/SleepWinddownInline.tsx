"use client";

import { useEffect, useState } from "react";
import { X, Moon, BookOpen, AlarmClock } from "lucide-react";

export default function SleepWinddownInline({
  onDone,
  onCancel,
  seconds = 120,
}: {
  onDone: () => void;
  onCancel: () => void;
  seconds?: number;
}) {
  const [t, setT] = useState(seconds);
  const [dim, setDim] = useState(true);
  const [phoneAway, setPhoneAway] = useState(false);
  const [alarmReady, setAlarmReady] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (t <= 0) onDone();
  }, [t, onDone]);

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

        <div className="p-6">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Wind-down • {t}s</div>
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Landing the plane</h3>
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-sage-600" checked={dim} onChange={(e)=>setDim(e.target.checked)} />
              <span className="flex items-center gap-2"><Moon className="w-4 h-4" /> Dim screen / lights</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-sage-600" checked={phoneAway} onChange={(e)=>setPhoneAway(e.target.checked)} />
              <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Put phone away, grab short read</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-sage-600" checked={alarmReady} onChange={(e)=>setAlarmReady(e.target.checked)} />
              <span className="flex items-center gap-2"><AlarmClock className="w-4 h-4" /> Alarm set / water nearby</span>
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={onDone} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700">All set</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
