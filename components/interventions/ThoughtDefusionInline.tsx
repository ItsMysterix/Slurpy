"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function ThoughtDefusionInline({
  onDone, onCancel,
}: { onDone: () => void; onCancel: () => void }) {
  const [txt, setTxt] = useState("");
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (!txt.trim()) return;
    const id = window.setTimeout(() => setFade(true), 3000);
    const id2 = window.setTimeout(() => onDone(), 5200);
    return () => { window.clearTimeout(id); window.clearTimeout(id2); };
  }, [txt, onDone]);

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-amber-200/70 dark:border-amber-600/50 bg-amber-50/70 dark:bg-amber-900/20 shadow-xl backdrop-blur-md">
        <button onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 p-2 rounded-lg text-amber-700 dark:text-amber-200">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6">
          <h3 className="text-lg font-medium text-amber-900 dark:text-amber-100">Write it. Pin it outside your head.</h3>
          <input
            className="mt-3 w-full rounded-xl border p-2 text-sm border-amber-300/70 dark:border-amber-600/50 bg-white/80 dark:bg-amber-900/30"
            placeholder="Type the intrusive thought…"
            value={txt}
            onChange={(e)=>setTxt(e.target.value)}
          />
          {txt && (
            <div className={`mt-4 inline-block px-3 py-2 rounded-lg bg-amber-100/90 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 transition-opacity ${fade?"opacity-0":""}`}>
              {txt}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
