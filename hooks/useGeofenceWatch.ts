// hooks/useGeofenceWatch.ts
"use client";
import { useEffect, useRef, useState } from "react";

type Options = { enabled: boolean; pingMs?: number };
export function useGeofenceWatch({ enabled, pingMs = 15000 }: Options) {
  const [status, setStatus] = useState<"idle"|"denied"|"watching">("idle");
  const watchId = useRef<number | null>(null);
  const lastPing = useRef<number>(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("idle"); return;
    }
    const onVis = () => { if (document.visibilityState === "hidden") lastPing.current = 0; };
    document.addEventListener("visibilitychange", onVis);

    const start = async () => {
      // soft permission probe
      // @ts-ignore
      const perm = await navigator.permissions?.query?.({ name: "geolocation" });
      if (perm && perm.state === "denied") { setStatus("denied"); return; }

      watchId.current = navigator.geolocation.watchPosition(async (pos) => {
        setStatus("watching");
        const now = Date.now();
        const minInterval = document.visibilityState === "hidden" ? pingMs*2 : pingMs;
        if (now - lastPing.current < minInterval) return;
        lastPing.current = now;

        ctrl.current?.abort();
        ctrl.current = new AbortController();

        const body = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          client_ts: new Date().toISOString(),
        };

        try {
          const res = await fetch("/api/geo/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.current.signal,
          });
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data?.entered) && data.entered.length) {
            window.dispatchEvent(new CustomEvent("geo-enter", { detail: data.entered }));
          }
        } catch {/* ignore */}
      }, () => {}, {
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 10_000,
      });
    };

    start();

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      ctrl.current?.abort();
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, pingMs]);

  return { status };
}
