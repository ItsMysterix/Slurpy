"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function Reframe3ColInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [thought, setThought] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reframe, setReframe] = useState("");

  const save = async () => {
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          title: "CBT Reframe",
          content: `Thought: ${thought}\nEvidence: ${evidence}\nReframe: ${reframe}`,
          tags: ["cbt","reframe"]
        })
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
        <div className="p-6 grid gap-2">
          <h3 className="text-lg font-medium">3-Column Reframe</h3>
          <input className="rounded-xl border p-2 text-sm" placeholder="Harsh thought" value={thought} onChange={(e)=>setThought(e.target.value)} />
          <input className="rounded-xl border p-2 text-sm" placeholder="One fair counterexample" value={evidence} onChange={(e)=>setEvidence(e.target.value)} />
          <input className="rounded-xl border p-2 text-sm" placeholder="Kinder reframe" value={reframe} onChange={(e)=>setReframe(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Save</button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
