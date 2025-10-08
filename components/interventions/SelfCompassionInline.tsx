"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function SelfCompassionInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [txt, setTxt] = useState("");
  const save = async () => {
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ title: "Self-Compassion Postcard", content: txt, tags: ["self-compassion"] }),
      });
    } catch {}
    onDone();
  };
  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-rose-200/70 dark:border-rose-600/50 bg-rose-50/70 dark:bg-rose-900/20 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-rose-700 dark:text-rose-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <h3 className="text-lg font-medium text-rose-900 dark:text-rose-100">Write to a friend (who is you)</h3>
          <textarea className="mt-3 w-full min-h-[120px] rounded-xl border p-2 text-sm border-rose-300/70 dark:border-rose-600/50 bg-white/80 dark:bg-rose-900/20"
            placeholder="What would you say to a dear friend who felt this way?"
            value={txt} onChange={(e)=>setTxt(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-800">Save</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
