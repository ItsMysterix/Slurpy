// hooks/useSTT.ts
"use client";
import { useEffect, useRef, useState } from "react";

export function useSTT() {
  const [state, setState] = useState<"idle"|"listening"|"unsupported">("idle");
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const recRef = useRef<any>(null);
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  useEffect(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
      rec.onresult = (e: any) => {
        let interimStr="", finalStr="";
        for (let i=0;i<e.results.length;i++){
          const r = e.results[i];
          if (r.isFinal) {
            finalStr += r[0].transcript;
          } else {
            interimStr += r[0].transcript;
          }
        }
        setInterim(interimStr);
        if (finalStr) { setFinalText(finalStr); setInterim(""); }
      };
      rec.onend = () => { if (state === "listening") setState("idle"); };
      rec.onerror = () => setState("idle");
      recRef.current = rec;
    } else {
      setState("unsupported");
    }
  }, []);

  const start = async () => {
    setFinalText(""); setInterim("");
    if (recRef.current) { setState("listening"); recRef.current.start(); return; }
    // server fallback (records a short clip → /api/stt)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    media.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunks.current = [];
    media.current.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    media.current.onstop = async () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      const fd = new FormData(); fd.append("file", blob, "speech.webm");
      try {
        const res = await fetch("/api/stt", { method: "POST", body: fd });
        const data = await res.json(); setFinalText(data?.text || "");
      } catch { /* ignore */ } finally { setState("idle"); }
    };
    setState("listening"); media.current.start();
  };

  const stop = () => {
    if (recRef.current) recRef.current.stop();
    else media.current?.stop();
  };

  return { state, interim, finalText, start, stop };
}
