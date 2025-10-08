// components/VoiceChat.tsx
"use client";

import { useEffect, useState } from "react";
import { useSTT } from "@/hooks/useSTT";
import { useTTS } from "@/hooks/useTTS";

export default function VoiceChat() {
  const { state, interim, finalText, start, stop } = useSTT();
  const { speak, speaking, cancel, ready, defaultVoiceName } = useTTS();
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!finalText) return;
      setThinking(true);
      try {
        const res = await fetch("/api/proxy-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: finalText }),
        });

        let reply = "I’m here.";
        try {
          const data = await res.json();
          reply = data?.message ?? data?.reply ?? reply;
        } catch {
          // non-JSON; keep default
        }

        // Stop any ongoing speech before speaking the new reply
        cancel();

        // Speak with gentle prosody & chunking; prefer a good voice if available
        await speak(reply, {
          voiceName: defaultVoiceName, // auto-picked Google/Microsoft if present
          rate: 1.02,
          pitch: 1.05,
          volume: 1.0,
          maxChunkLen: 220,
        });
      } catch {
        cancel();
        await speak("Network issue. Try again.", { rate: 1.02, pitch: 1.0 });
      } finally {
        setThinking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalText]);

  const armed = state === "listening";

  return (
    <div className="p-4 rounded-2xl border border-neutral-700 flex flex-col gap-3">
      <div className="text-sm opacity-70 h-6">
        {armed
          ? (interim || "Listening…")
          : thinking
          ? "Thinking…"
          : speaking
          ? "Speaking…"
          : ready
          ? "Push-to-talk ready"
          : "Loading voices…"}
      </div>

      <div className="flex items-center gap-3">
        <button
          onMouseDown={start}
          onMouseUp={stop}
          onTouchStart={start}
          onTouchEnd={stop}
          className={`px-4 py-3 rounded-2xl border ${
            armed ? "border-rose-500" : "border-neutral-700"
          }`}
          aria-pressed={armed}
        >
          {armed ? "🎙️ Release to send" : "🎤 Hold to talk"}
        </button>

        <button onClick={cancel} className="px-3 py-2 rounded-xl border">
          ⏹ Stop voice
        </button>
      </div>
    </div>
  );
}
