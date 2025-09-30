// components/GeoToggle.tsx
"use client";
import { useEffect, useState } from "react";
import { useGeofenceWatch } from "@/hooks/useGeofenceWatch";

export default function GeoToggle() {
  const [on, setOn] = useState(false);
  const { status } = useGeofenceWatch({ enabled: on });

  useEffect(() => {
    const handler = (e: any) => {
      const hits = e.detail as Array<{ title?: string; distance_m?: number }>;
      hits.forEach(h => alert(`Event started: ${h.title ?? "unknown"} • ~${h.distance_m ?? 0}m`));
    };
    window.addEventListener("geo-enter", handler as any);
    return () => window.removeEventListener("geo-enter", handler as any);
  }, []);

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-neutral-700">
      <button onClick={() => setOn(v => !v)} className="px-3 py-1 rounded-xl border">
        {on ? "🔒 Stop location" : "📍 Enable location"}
      </button>
      <span className="text-sm opacity-70">Status: {status}</span>
    </div>
  );
}
