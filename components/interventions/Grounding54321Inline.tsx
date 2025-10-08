"use client";

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";

export default function Grounding54321Inline({
  onDone,
  onCancel,
  seconds = 75,
}: {
  onDone: () => void;
  onCancel: () => void;
  seconds?: number;
}) {
  const [t, setT] = useState(seconds);
  const [step, setStep] = useState(5);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (t <= 0) onDone();
  }, [t, onDone]);

  const label =
    step === 5 ? "See" :
    step === 4 ? "Feel (touch)" :
    step === 3 ? "Hear" :
    step === 2 ? "Smell" :
    "Taste";

  const target = step;

  const advance = () => {
    if (count + 1 < target) {
      setCount(count + 1);
    } else {
      if (step > 1) {
        setStep(step - 1);
        setCount(0);
      } else {
        onDone();
      }
    }
  };

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button
          aria-label="Stop"
          onClick={onCancel}
          className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Time left</div>
          <div className="text-3xl font-semibold text-slate-800 dark:text-slate-100">{t}s</div>

          <h3 className="mt-4 text-lg font-medium text-slate-800 dark:text-slate-100">
            5-4-3-2-1 Grounding
          </h3>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Spot <b>{target}</b> things you <b>{label.toLowerCase()}</b>. Tap to count.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            {Array.from({ length: target }).map((_, i) => (
              <button
                key={i}
                onClick={advance}
                className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                  i < count
                    ? "bg-sage-500 text-white border-sage-600"
                    : "border-slate-300/60 dark:border-slate-600/60"
                }`}
                aria-pressed={i < count}
              >
                {i < count ? <Check className="w-4 h-4" /> : i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
