"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TF = "day"|"week"|"month"|"year";
type TopicRow = { topic: string; href?: string; lastSeenISO?: string };

export default function Topics({ items, timeframe }: { items: TopicRow[]; timeframe: TF }) {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">
          {timeframe==="day" ? "Today's Topics" : "Recent Topics Discussed"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {items?.length ? items.map(t=>(
            <a key={`${t.topic}-${t.lastSeenISO ?? ""}`} href={t.href ?? "#"} className="cursor-pointer">
              <Badge variant="secondary" className="bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 hover:bg-sage-200 dark:hover:bg-gray-700 transition-colors">
                {t.topic}
              </Badge>
            </a>
          )) : <p className="text-clay-500 dark:text-sand-400 text-sm">No topics identified yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
