"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

/** Same toggle behavior/look as other pages (Chat/Insights) */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button
      aria-label="Toggle theme"
      onClick={() => mounted && setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-slate-600 hover:text-slate-500 dark:text-slate-400 dark:hover:text-slate-300 p-2 rounded-lg"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  );
}

export default function CalendarHeader({
  currentDate,
  onPrev,
  onNext,
}: {
  /** optional to avoid crashes during first render */
  currentDate?: Date;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Defensive: if currentDate is undefined or invalid, fall back to "now"
  const d = currentDate instanceof Date && !Number.isNaN(+currentDate) ? currentDate : new Date();
  const monthLabel = d.toLocaleString("en-US", { month: "long", year: "numeric" });

  // NOTE: No ml-16/ml-64 here; the page container handles sidebar offset (same pattern as ChatHeader).
  return (
    <div className="h-16 flex items-center justify-between px-4 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm border-b border-slate-100/50 dark:border-slate-800/50">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <CalendarIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
        <h1 className="text-2xl font-display font-medium text-slate-700 dark:text-slate-200 truncate">
          {monthLabel}
        </h1>
      </div>

      {/* Center: Month nav */}
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={onPrev}
          className="rounded-xl border-slate-200/60 dark:border-slate-600/60"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={onNext}
          className="rounded-xl border-slate-200/60 dark:border-slate-600/60"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Right: Track Progress & Theme (kept exactly as before) */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          className="h-8 rounded-lg bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Track Progress
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
