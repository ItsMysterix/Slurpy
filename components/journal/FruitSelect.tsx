"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { ALL_FRUITS } from "@/lib/moodFruit";

type Props = {
  /** Store the icon URL (e.g. "/Peachy%20Keen.ico"). */
  value: string | null;
  onChange: (iconUrl: string) => void;
  placeholder?: string;
  className?: string;
};

export default function FruitSelect({ value, onChange, placeholder = "Pick fruit…", className }: Props) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!btnRef.current) return;
      if (!btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const selected = ALL_FRUITS.find((f) => f.icon === value);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 px-3 rounded-xl border border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 flex items-center justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <img src={selected.icon} alt={selected.name} className="h-5 w-5 rounded-sm" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{selected.name}</span>
            </>
          ) : (
            <span className="text-sm text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="w-4 h-4 opacity-70" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full max-h-64 overflow-auto rounded-xl border border-sage-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          <ul className="py-1">
            {ALL_FRUITS.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(f.icon);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-sage-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <img src={f.icon} alt={f.name} className="h-5 w-5 rounded-sm" />
                  <span className="text-sm">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
