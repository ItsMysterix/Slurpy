"use client";
import { useState } from "react";
import { X } from "lucide-react";

const TEMPLATE = `I care about you, and I’d like to repair.
When ______ happened, I felt ______.
What I wish for is ______.
Can we try ______?`;

export default function RepairNudgeInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [msg, setMsg] = useState(TEMPLATE);
  const save = async () => {
    try {
      await navigator.clipboard.writeText(msg);
    } catch {}
    onDone();
  };
  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <h3 className="text-lg font-medium">Draft an I-statement?</h3>
          <textarea className="mt-3 w-full min-h-[120px] rounded-xl border p-2 text-sm" value={msg} onChange={(e)=>setMsg(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Copy</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
