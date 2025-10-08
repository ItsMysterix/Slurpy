"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const CHOICES = ["Water", "Stretch", "Inbox-1"];

export default function Activation120Inline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [t, setT] = useState<number | null>(null);

  useEffect(() => {
    if (t === null) return;
    const id = window.setInterval(() => setT((x) => (x ?? 0) - 1), 1000);
    return () => window.clearInterval(id);
  }, [t]);

  useEffect(() => { if (t === 0) onDone(); }, [t, onDone]);

  const start = (c: string) => { setChoice(c); setT(120); };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 text-center">
          <h3 className="text-lg font-medium">Tiny move &gt; zero move</h3>
          {!choice ? (
            <div className="mt-3 flex justify-center gap-2">
              {CHOICES.map(c => (
                <button key={c} onClick={()=>start(c)} className="px-3 py-1.5 rounded-xl border hover:bg-slate-100/60 dark:hover:bg-slate-800/60">{c}</button>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-3 text-sm">Go: {choice}</div>
              <div className="text-3xl font-semibold mt-2">{t}s</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
