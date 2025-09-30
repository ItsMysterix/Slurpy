// components/chat/MessageBubble.tsx
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import type { Message } from "@/lib/chat-store";
import { PERSONA_MODES } from "@/lib/persona";
import { CopyButton, TTSButton, STTButton } from "@/components/chat/MessageActions"; // optional if you added these

type Props = { message: Message };

function parseCareKit(raw: string): { main: string; care?: { skill?: string; micro_goal?: string; psychoedu?: string; question?: string } } {
  if (!raw) return { main: "" };
  const lines = raw.split("\n");
  const startIdx = lines.findIndex((l) => /—\s*Care Kit\s*—/i.test(l));
  if (startIdx === -1) return { main: raw.trim() };

  const main = lines.slice(0, startIdx).join("\n").trim();
  const careLines = lines.slice(startIdx + 1);

  const care: any = {};
  for (const l of careLines) {
    const m = l.replace(/^[-•]\s*/, "").trim();
    if (/^try:/i.test(m)) care.skill = m.replace(/^try:\s*/i, "").trim();
    else if (/^micro:/i.test(m)) care.micro_goal = m.replace(/^micro:\s*/i, "").trim();
    else if (/^note:/i.test(m)) care.psychoedu = m.replace(/^note:\s*/i, "").trim();
    else if (/^question:/i.test(m)) care.question = m.replace(/^question:\s*/i, "").trim();
  }
  const hasAny = care.skill || care.micro_goal || care.psychoedu || care.question;
  return { main, care: hasAny ? care : undefined };
}

function CareKitCard({ care }: { care: ReturnType<typeof parseCareKit>["care"] }) {
  if (!care) return null;
  return (
    <div className="mt-3 w-full max-w-[560px] rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur p-4">
      <div className="text-xs tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-2">Care Kit</div>
      <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
        {care.skill && <li><span className="opacity-70 mr-1.5">Try:</span>{care.skill}</li>}
        {care.micro_goal && <li><span className="opacity-70 mr-1.5">Micro:</span>{care.micro_goal}</li>}
        {care.psychoedu && <li><span className="opacity-70 mr-1.5">Note:</span>{care.psychoedu}</li>}
        {care.question && <li><span className="opacity-70 mr-1.5">Question:</span>{care.question}</li>}
      </ul>
    </div>
  );
}

export default function MessageBubble({ message }: Props) {
  const { user } = useUser();
  const isUser = message.sender === "user";

  const { main, care } = React.useMemo(() => {
    if (!isUser && typeof message.content === "string") return parseCareKit(message.content);
    return { main: message.content as string, care: undefined };
  }, [isUser, message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-slate-400 via-zinc-400 to-stone-400 dark:from-slate-500 dark:via-zinc-500 dark:to-stone-500 flex-shrink-0 rounded-full grid place-items-center shadow-lg">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-100 backdrop-blur-sm"
              : "bg-slate-50/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 backdrop-blur-sm"
          }`}
        >
          <p className="font-rubik leading-relaxed whitespace-pre-wrap">{main}</p>
          {!isUser && care && <CareKitCard care={care} />}
        </div>

        <div className="flex items-center gap-2 mt-1 px-2">
          <span className="text-xs text-slate-400 dark:text-slate-400 font-rubik">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && message.modes && message.modes.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-400 font-rubik">
              • {message.modes.map((id) => PERSONA_MODES.find((m) => m.id === id)?.name).join(" + ")}
            </span>
          )}

          {/* Optional actions for assistant messages */}
          {!isUser && (
            <span className="ml-1 flex items-center gap-1">
              {/* If you created these components already */}
              <TTSButton text={main} />
              <CopyButton text={main} />
              {/* STT typically belongs near the input; include here only if you want per-bubble voice reply */}
              {/* <STTButton onResult={(t)=>{/* pipe to input/send *\/} } size="xs" /> */}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-zinc-400 via-stone-400 to-slate-400 dark:from-zinc-500 dark:via-stone-500 dark:to-slate-500 flex-shrink-0 rounded-full overflow-hidden shadow-lg grid place-items-center">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-white" />
          )}
        </div>
      )}
    </motion.div>
  );
}
