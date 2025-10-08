"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function Gratitude3x10Inline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [i, setI] = useState(0);
  const [t, setT] = useState(10);
  const [ans, setAns] = useState(["", "", ""]);

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (t <= 0) {
      if (i < 2) { setI(i + 1); setT(10); }
      else void save();
    }
  }, [t]); // eslint-disable-line

  const save = async () => {
    try {
      const content = ans.filter(Boolean).map((a, idx) => `${idx + 1}. ${a}`).join("\n");
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ title: "Gratitude 3×10s", content, tags: ["gratitude"] }),
      });
    } catch {}
    onDone();
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <div className="text-sm">Name a tiny good thing ({i + 1}/3)</div>
          <div className="text-3xl font-semibold mt-1">{t}s</div>
          <input className="mt-3 w-full rounded-xl border p-2 text-sm" placeholder="Something small from today…" value={ans[i] ?? ""} onChange={(e)=>setAns(a => { const n=[...a]; n[i]=e.target.value; return n; })} />
        </div>
      </div>
    </div>
  );
}
