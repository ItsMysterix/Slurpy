"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";

type SafetyDashboard = {
  available: boolean;
  summary: {
    total: number;
    immediate: number;
    elevated: number;
    ctaClicks: number;
    ctaDismisses: number;
    clickThroughRate: number;
    lastEventAt: string | null;
  };
  daily: Array<{ date: string; immediate: number; elevated: number }>;
};

export default function SafetyEventsCard({ data }: { data: SafetyDashboard | null }) {
  if (!data) return null;

  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Safety Events
          </h3>
          <Badge className="bg-sage-100 text-sage-600 border-sage-300 dark:bg-gray-800 dark:text-sand-300">
            {data.available ? "Tracked" : "Unavailable"}
          </Badge>
        </div>

        {!data.available ? (
          <p className="text-sm text-clay-500 dark:text-sand-400">Safety event table not available yet. Run latest migrations.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Metric label="Total" value={data.summary.total} />
              <Metric label="Immediate" value={data.summary.immediate} />
              <Metric label="Elevated" value={data.summary.elevated} />
              <Metric label="CTA CTR" value={`${data.summary.clickThroughRate}%`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <small className="text-clay-500 dark:text-sand-400">CTA clicks: <b>{data.summary.ctaClicks}</b></small>
              <small className="text-clay-500 dark:text-sand-400">CTA dismisses: <b>{data.summary.ctaDismisses}</b></small>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">{value}</div>
      <div className="text-sm text-clay-500 dark:text-sand-400">{label}</div>
    </div>
  );
}
