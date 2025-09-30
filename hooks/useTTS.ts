// hooks/useTTS.ts
"use client";
import { useEffect, useRef, useState } from "react";
export function useTTS() {
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const uRef = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const onvoices = () => setReady(true);
    speechSynthesis.onvoiceschanged = onvoices; setReady(true);
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);
  const speak = (text: string, opts?: { rate?: number; pitch?: number; maxChars?: number }) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const max = opts?.maxChars ?? 350;
      const u = new SpeechSynthesisUtterance(text.length > max ? text.slice(0,max)+"…" : text);
      if (opts?.rate) u.rate = opts.rate;
      if (opts?.pitch) u.pitch = opts.pitch;
      u.onend = () => { setSpeaking(false); resolve(); };
      u.onerror = () => { setSpeaking(false); resolve(); };
      setSpeaking(true); uRef.current = u; speechSynthesis.speak(u);
    });
  const cancel = () => { speechSynthesis?.cancel(); setSpeaking(false); };
  return { ready, speaking, speak, cancel };
}
