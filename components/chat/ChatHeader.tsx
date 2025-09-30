"use client";
import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button
      onClick={() => mounted && setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost" size="sm"
      className="text-slate-600 hover:text-slate-500 dark:text-slate-400 dark:hover:text-slate-300 p-2 rounded-lg"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  );
}

export default function ChatHeader({ title, sidebarOpen }:{ title:string; sidebarOpen:boolean }) {
  return (
    <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm border-b border-slate-100/50 dark:border-slate-800/50">
      <motion.h2
        className={`text-2xl font-display font-medium text-slate-700 dark:text-slate-200 ${sidebarOpen ? "ml-8" : "ml-4"}`}
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
      >
        {title}
      </motion.h2>
      <ThemeToggle />
    </div>
  );
}
