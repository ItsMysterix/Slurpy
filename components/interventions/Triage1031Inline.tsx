"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function Triage1031Inline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [raw, setRaw] = useState("");
  const [todos, setTodos] = useState<string[]>([]);
  const [picked3, setPicked3] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState<string | null>(null);

  const extract = () => {
    // super naive: split lines / bullets
    const items = raw.split(/\n|•|-|\*/).map(s => s.trim()).filter(Boolean).slice(0, 10);
    setTodos(items);
  };

  const togglePick = (t: string) => {
    setPicked3((arr) => arr.includes(t) ? arr.filter(x=>x!==t) : arr.length < 3 ? [...arr, t] : arr);
  };

  const scheduleOne = async () => {
    const item = picked3[0] ?? todos[0];
    setScheduled(item ?? null);
    try {
      if (item) {
        await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ title: "10-3-1 Triage", content: `10: ${todos.join(", ")}\n3: ${picked3.join(", ")}\n1: ${item}`, tags: ["triage"] })
        });
      }
    } finally { onDone(); }
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6">
          <h3 className="text-lg font-medium">Let’s shrink the monster</h3>
          {!todos.length ? (
            <>
              <textarea className="mt-3 w-full min-h-[110px] rounded-xl border p-2 text-sm" placeholder="Paste your list…" value={raw} onChange={(e)=>setRaw(e.target.value)} />
              <button onClick={extract} className="mt-3 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Extract 10</button>
            </>
          ) : (
            <>
              <div className="mt-3 grid gap-2">
                {todos.map(t => (
                  <button key={t} onClick={()=>togglePick(t)} className={`px-3 py-1.5 rounded-xl border text-left ${picked3.includes(t)?"bg-slate-800 text-white border-slate-800":"hover:bg-slate-100/60 dark:hover:bg-slate-800/60"}`}>{t}</button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button disabled={!todos.length} onClick={scheduleOne} className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60">Schedule 1</button>
                <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
