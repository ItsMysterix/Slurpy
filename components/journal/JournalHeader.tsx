"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button
      onClick={() => mounted && setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  );
}

export default function JournalHeader({
  userFirstName,
  onNew,
}: {
  userFirstName?: string;
  onNew: () => void;
}) {
  return (
    <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
      <motion.h1
        className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <BookOpen className="w-6 h-6" />
        Journal
        {userFirstName ? (
          <span className="text-sm font-sans text-clay-500 dark:text-sand-400">- {userFirstName}'s entries</span>
        ) : null}
      </motion.h1>
      <div className="flex items-center gap-3">
        <Button
          onClick={onNew}
          className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl px-4 py-2"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Entry
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
