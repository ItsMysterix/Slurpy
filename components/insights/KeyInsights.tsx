"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Heart, TrendingUp, Calendar as CalendarIcon } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  TrendingUp, Heart, Brain, Calendar: CalendarIcon,
};

type Item = { title: string; description: string; icon?: string; trend?: "positive"|"negative"|"neutral" };

export default function KeyInsights({ items }: { items: Item[] }) {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5" /> Key Insights
        </h3>
        <div className="space-y-4">
          {items.map((ins, i)=>{
            const Icon = (ins.icon && iconMap[ins.icon]) || Brain;
            return (
              <div key={`${ins.title}-${i}`} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${
                  ins.trend==="positive" ? "from-green-400 to-green-500"
                  : ins.trend==="negative" ? "from-red-400 to-red-500"
                  : "from-sage-400 to-clay-500"
                }`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-clay-700 dark:text-sand-200 mb-1">{ins.title}</h4>
                  <p className="text-sm text-clay-500 dark:text-sand-400 leading-relaxed">{ins.description}</p>
                </div>
              </div>
            );
          })}
          {!items.length && <div className="text-sm text-clay-500 dark:text-sand-400">Getting Started — chat more to unlock insights.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
