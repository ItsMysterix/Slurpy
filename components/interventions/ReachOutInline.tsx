"use client";

import { useState } from "react";
import { X, Send } from "lucide-react";

export default function ReachOutInline({
  onDone,
  onCancel,
}: {
  onDone: (message?: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    "Hey — I’m having a tough moment. Do you have 5 minutes to talk or just sit with me?"
  );

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button
          aria-label="Close"
          onClick={onCancel}
          className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Reach out to someone you trust</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Edit and copy, then send.</p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-3 w-full min-h-[100px] rounded-lg border bg-transparent p-3"
          />

          <div className="mt-4 flex gap-3">
            <button onClick={copy} className="px-3 py-2 rounded-lg border">Copy</button>
            <button onClick={() => onDone(text)} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700 flex items-center gap-2">
              <Send className="w-4 h-4" /> Sent
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
