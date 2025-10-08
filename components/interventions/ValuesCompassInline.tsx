"use client";
import { useState } from "react";
import { X, Compass } from "lucide-react";

const VALUES = ["Respect","Fairness","Autonomy","Care","Honesty","Loyalty","Safety"];

export default function ValuesCompassInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  const save = async () => {
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ title: "Value Compass", content: `I felt anger because ${picked} was stepped on. One small repair: ___`, tags: ["values","anger"] })
      });
    } catch {}
    onDone();
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6">
          <h3 className="text-lg font-medium flex items-center gap-2"><Compass className="w-4 h-4" /> Anger protects a value. Which one?</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {VALUES.map(v => (
              <button key={v} onClick={()=>setPicked(v)} className={`px-3 py-1.5 rounded-xl border ${picked===v?"bg-slate-800 text-white border-slate-800":"border-slate-300 dark:border-slate-600"}`}>{v}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={!picked} onClick={save} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60">Save</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
