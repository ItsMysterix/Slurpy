// components/chat/DropInRenderer.tsx
"use client";

import { motion } from "framer-motion";
import type { DropIn } from "@/lib/dropins";

// import from the barrel to avoid name mismatches
import {
  BreathingInline,
  HeatReleaseInline,
  Grounding54321Inline,
  SleepWinddownInline,
  Focus25Inline,
  CalendarSuggestInline,
  MicroBreakInline,
  ReachOutInline,
  MoodCheckInline,
  VagusHumInline,
  ColdSplashInline,
  ProgressiveMicroInline,
  ThoughtDefusionInline,
  Reframe3ColInline,
  ValuesCompassInline,
  Activation120Inline,
  Triage1031Inline,
  BlueKillSwitchInline,
  RacingThoughtsInline,
  SelfCompassionInline,
  RepairNudgeInline,
  Gratitude3x10Inline,
  TinyWinInline,
  StreakCareInline,
} from "@/components/interventions";

export default function DropInRenderer({
  dropIns,
  onDismiss,
}: {
  dropIns: DropIn[];
  onDismiss: (id: string) => void;
}) {
  if (!dropIns.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-3 max-w-sm w-[min(420px,calc(100vw-1rem))]">
      {dropIns.map((d) => (
        <motion.div
          key={d.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-sage-200/60 dark:border-gray-700/60 bg-white/90 dark:bg-gray-800/90 backdrop-blur p-3 shadow-lg"
        >
          {/* De-escalation / grounding */}
          {d.kind === "grounding-54321" && (
            <Grounding54321Inline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} seconds={60} />
          )}
          {d.kind === "vagus-hum" && <VagusHumInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}
          {d.kind === "cold-splash" && (
            <ColdSplashInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "progressive-micro" && (
            <ProgressiveMicroInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}

          {/* Cognitive tools */}
          {d.kind === "thought-defusion" && (
            <ThoughtDefusionInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "cbt-3col" && <Reframe3ColInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}
          {d.kind === "values-compass" && (
            <ValuesCompassInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}

          {/* Activation / focus */}
          {d.kind === "activation-120s" && (
            <Activation120Inline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "triage-10-3-1" && (
            <Triage1031Inline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "focus-25" && (
            <Focus25Inline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} seconds={25 * 60} />
          )}
          {d.kind === "blue-kill-switch" && (
            <BlueKillSwitchInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}

          {/* Sleep / rumination */}
          {d.kind === "racing-thoughts" && (
            <RacingThoughtsInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "sleep-winddown" && (
            <SleepWinddownInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}

          {/* Compassion / relationships */}
          {d.kind === "gratitude-3x10s" && (
            <Gratitude3x10Inline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "self-compassion" && (
            <SelfCompassionInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "repair-nudge" && (
            <RepairNudgeInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}

          {/* Reinforcement / meta */}
          {d.kind === "tiny-win" && <TinyWinInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}
          {d.kind === "streak-care" && <StreakCareInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}

          {/* Lightweight helpers */}
          {d.kind === "calendar-suggest" && (
            <CalendarSuggestInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />
          )}
          {d.kind === "micro-break" && (
            <MicroBreakInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} seconds={45} />
          )}
          {d.kind === "reach-out" && <ReachOutInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}
          {d.kind === "box-breathing" && (
            <BreathingInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} seconds={60} />
          )}
          {d.kind === "heat-release" && (
            <HeatReleaseInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} seconds={45} />
          )}
          {d.kind === "mood-checkin" && <MoodCheckInline onDone={() => onDismiss(d.id)} onCancel={() => onDismiss(d.id)} />}
        </motion.div>
      ))}
    </div>
  );
}
