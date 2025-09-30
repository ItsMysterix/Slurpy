"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import MoodTrendChart from "@/components/insights/MoodTrendChart";

type Row = { label: string; valence?: number|string|null };

export default function WeeklyTrends({ data }: { data: Row[] }) {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Weekly Mood Trends
        </h3>
        <MoodTrendChart
          data={(data||[]).map(d=>({ label: d.label, valence: Number(d.valence ?? 0) }))}
          height={280}
        />
      </CardContent>
    </Card>
  );
}
