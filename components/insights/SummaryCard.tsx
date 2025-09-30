"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import ValencePill from "@/components/insights/ValencePill";
import { iconForEmotion } from "@/lib/moodFruit";

type TF = "day"|"week"|"month"|"year";
type Header = {
  totalMinutes: number;
  totalMessages: number;
  currentEmotion: string;
  currentValenceNeg1To1: number;
  topicSentence: string;
}

export default function SummaryCard({ header, timeframe }: { header: Header; timeframe: TF; }) {
  const minutes = header.totalMinutes;
  const timeText = minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes/60)}h ${minutes%60}m`;

  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            {timeframe==="day"?"Today's Summary": timeframe==="week"?"This Week's Summary": timeframe==="month"?"This Month's Summary":"This Year's Summary"}
          </h3>
          <Badge className="bg-sage-100 text-sage-600 border-sage-300 dark:bg-gray-800 dark:text-sand-300">
            {timeframe==="day"?"Active":"Summary"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">{timeText}</div>
            <div className="text-sm text-clay-500 dark:text-sand-400">Total Time</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">{header.totalMessages}</div>
            <div className="text-sm text-clay-500 dark:text-sand-400">Messages</div>
          </div>

          <div className="text-center flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <img src={iconForEmotion(header.currentEmotion)} alt={header.currentEmotion} className="w-6 h-6 rounded" />
              <ValencePill valence={Number(header.currentValenceNeg1To1 || 0)} />
            </div>
            <div className="text-sm text-clay-500 dark:text-sand-400 capitalize">{header.currentEmotion}</div>
          </div>

          <div className="text-center">
            <div className="text-base md:text-lg text-clay-700 dark:text-sand-200">{header.topicSentence}</div>
            <div className="text-sm text-clay-500 dark:text-sand-400">Topics</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
