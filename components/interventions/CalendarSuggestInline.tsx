"use client";

import { useState } from "react";
import { X, Calendar, Bell } from "lucide-react";

export default function CalendarSuggestInline({
  onDone,
  onCancel,
}: {
  onDone: (payload?: { title: string; date: string; remindMins?: number }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [remind, setRemind] = useState(30);

  const submit = () => {
    if (!title || !date) return onDone();
    onDone({ title, date, remindMins: remind });
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
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5" /> Add to calendar?
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">We’ll set a gentle reminder.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="rounded-lg px-3 py-2 bg-transparent border"
            />
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg px-3 py-2 bg-transparent border"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <select
              value={remind}
              onChange={(e) => setRemind(Number(e.target.value))}
              className="rounded-lg px-2 py-1 bg-transparent border"
            >
              {[0, 5, 10, 15, 30, 60, 120].map((m) => (
                <option key={m} value={m}>{m === 0 ? "No reminder" : `${m} min before`}</option>
              ))}
            </select>
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={submit} className="px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700">
              Save
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border">Skip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
