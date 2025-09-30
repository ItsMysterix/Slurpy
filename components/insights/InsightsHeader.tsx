"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Loader2, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TF = "day"|"week"|"month"|"year";

export default function InsightsHeader({
  userFirstName,
  timeframe,
  onTimeframeChange,
  refreshing,
  periodLabelOverride,
}: {
  userFirstName?: string;
  timeframe: TF;
  onTimeframeChange: (t: TF)=>void;
  refreshing?: boolean;
  periodLabelOverride?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(()=>setMounted(true),[]);

  const label = (t:TF)=> t==="day"?"Today":t==="week"?"This Week":t==="month"?"This Month":"This Year";

  return (
    <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
      <motion.h1
        initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ duration:.5 }}
        className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3"
      >
        <TrendingUp className="w-6 h-6" />
        Session Insights
        {userFirstName && <span className="text-sm text-clay-500 dark:text-sand-400">- {userFirstName}&rsquo;s analytics</span>}
      </motion.h1>

      <div className="flex items-center gap-3">
        <div className="flex bg-white/50 dark:bg-gray-800/50 rounded-xl p-1 border border-sage-200/50 dark:border-gray-700/50">
          {(["day","week","month","year"] as TF[]).map(id=>(
            <Button key={id}
              onClick={()=>onTimeframeChange(id)}
              variant={timeframe===id?"default":"ghost"} size="sm"
              className={`rounded-lg text-xs ${timeframe===id
                ? "bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 text-white"
                : "text-clay-600 hover:text-clay-700 dark:text-sand-300 dark:hover:text-sand-200 hover:bg-sage-100 dark:hover:bg-gray-700/50"}`}
            >
              {label(id)}
            </Button>
          ))}
        </div>

        <Badge variant="secondary" className="bg-sage-100 text-sage-700 dark:bg-gray-800 dark:text-sand-300 border-sage-200 dark:border-gray-700">
          {periodLabelOverride ?? ""}
        </Badge>

        <AnimatePresence>{refreshing && <Loader2 className="w-4 h-4 animate-spin text-sage-600 dark:text-sand-300" />}</AnimatePresence>

        <Button
          variant="ghost" size="sm"
          className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2"
          onClick={()=> mounted && setTheme(theme==="dark"?"light":"dark")}
        >
          {mounted ? (theme==="dark" ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>) : <Sun className="w-5 h-5 opacity-0" />}
        </Button>
      </div>
    </div>
  );
}
