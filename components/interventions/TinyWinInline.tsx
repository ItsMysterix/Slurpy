"use client";
import { useState } from "react";
import { X, PartyPopper } from "lucide-react";

export default function TinyWinInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [txt, setTxt] = useState("");
  const save = async () => {
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ title: "Tiny Win", content: txt || "Banked a small win.", tags: ["win"] }),
      });
    } catch {}
    onDone();
  };
  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-emerald-200/70 dark:border-emerald-600/50 bg-emerald-50/70 dark:bg-emerald-900/20 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-emerald-700 dark:text-emerald-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <h3 className="text-lg font-medium text-emerald-900 dark:text-emerald-100 inline-flex items-center gap-2"><PartyPopper className="w-4 h-4" /> Bank the win?</h3>
          <input className="mt-3 w-full rounded-xl border p-2 text-sm" placeholder="What did you do?" value={txt} onChange={(e)=>setTxt(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">Save to journal</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
