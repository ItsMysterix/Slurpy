"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function MoodCheckInline({
  onDone,
  onCancel,
}: {
  onDone: (mood?: { score: number; note?: string }) => void;
  onCancel: () => void;
}) {
  const [score, setScore] = useState(6);
  const [note, setNote] = useState("");

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
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Quick mood check</h3>
          <div className="mt-3">
            <input
              type="range"
              min={1}
              max={10}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">How’s your mood? {score}/10</div>
          </div>

          <textarea
            value={note}
            onChange={(e)=>setNote(e.target.value)}
            placeholder="Anything you want to add?"
            className="mt-3 w-full min-h-[80px] rounded-lg border bg-transparent p-3"
          />

          <div className="mt-4 flex gap-3">
            <button onClick={() => onDone({ score, note: note.trim() || undefined })} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700">
              Save
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
