"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Volume2, VolumeX, Mic, Square } from "lucide-react";
import { useTTS } from "@/hooks/useTTS";
import { useSTT } from "@/hooks/useSTT";

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false), 1200); } catch {}
      }}
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-200/40 dark:hover:bg-slate-700/40 text-slate-400 dark:text-slate-400"
      aria-label="Copy message"
      title="Copy"
    >
      <Copy className="w-3.5 h-3.5" />
      {ok && <span className="opacity-70">Copied</span>}
    </button>
  );
}

export function TTSButton({ text }: { text: string }) {
  const { ready, speaking, speak, cancel } = useTTS();
  if (typeof window !== "undefined" && !("speechSynthesis" in window)) return null;
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => (speaking ? cancel() : speak(text, { rate: 1.03 }))}
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-200/40 dark:hover:bg-slate-700/40 text-slate-400 dark:text-slate-400"
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      title={speaking ? "Stop reading" : "Read aloud"}
    >
      {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  );
}

export function STTButton({
  onTranscript,
  disabled,
}: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const { state, interim, finalText, start, stop } = useSTT();
  const listening = state === "listening";
  const unsupported = state === "unsupported";

  useEffect(() => {
    if (finalText) onTranscript(finalText);
  }, [finalText, onTranscript]);

  return (
    <div className="relative">
      <Button
        onMouseDown={() => !disabled && !unsupported && start()}
        onMouseUp={() => !disabled && !unsupported && stop()}
        onTouchStart={() => !disabled && !unsupported && start()}
        onTouchEnd={() => !disabled && !unsupported && stop()}
        disabled={disabled || unsupported}
        variant="outline"
        className={`w-10 h-10 flex-shrink-0 rounded-lg ${
          listening
            ? "border-rose-400/70 bg-rose-200/20 dark:bg-rose-950/30"
            : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"
        }`}
        aria-pressed={listening}
        title={unsupported ? "Speech recognition not supported" : listening ? "Release to stop" : "Hold to speak"}
      >
        {listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </Button>

      {listening && interim && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 max-w-[240px] truncate text-[11px] px-2 py-1 rounded-md bg-slate-800 text-white shadow">
          {interim}
        </div>
      )}
    </div>
  );
}
