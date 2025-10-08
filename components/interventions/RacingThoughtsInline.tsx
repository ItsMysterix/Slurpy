"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function RacingThoughtsInline({
  onDone, onCancel, seconds = 120,
}: { onDone: () => void; onCancel: () => void; seconds?: number }) {
  const [t, setT] = useState(seconds);
  const [txt, setTxt] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { if (t <= 0) onDone(); }, [t, onDone]);

  const park = async () => {
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ title: "Racing Thoughts Catcher", content: txt, tags: ["sleep","worry-dump"] }),
      });
    } catch {}
    onDone();
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <div className="text-sm text-slate-500 dark:text-slate-400">2-min dump → we’ll park for AM</div>
          <div className="text-3xl font-semibold mt-1">{t}s</div>
          <textarea className="mt-3 w-full min-h-[120px] rounded-xl border p-2 text-sm" placeholder="Let it spill…" value={txt} onChange={(e)=>setTxt(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={park} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Park it</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
