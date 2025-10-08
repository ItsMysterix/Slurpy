"use client";
import { useState } from "react";
import { X, Moon } from "lucide-react";

export default function BlueKillSwitchInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [dim, setDim] = useState(false);
  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Moon className="w-4 h-4" /> We can land the plane.
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={()=>setDim(v=>!v)} className="px-3 py-1.5 rounded-xl border">{dim?"Restore":"Dim overlay"}</button>
            <button onClick={onDone} className="px-3 py-1.5 rounded-xl bg-slate-800 text-white">Done</button>
          </div>
        </div>
      </div>
      {dim && <div className="fixed inset-0 pointer-events-none bg-black/45 backdrop-blur-[1px] z-40" />}
    </div>
  );
}
