// lib/logger.ts
// Minimal redacting logger that avoids leaking secrets in logs.

type AnyObj = Record<string, unknown>;

const JWT_RE = /(^|\s|\b)(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)($|\s|\b)/g; // naive JWT detector
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g;

function redactValue(v: unknown): unknown {
  if (typeof v === "string") {
    let s = v.replace(JWT_RE, "$1<redacted:jwt>$3");
    s = s.replace(EMAIL_RE, "<redacted:email>");
    return s;
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") return redactObject(v as AnyObj);
  return v;
}

function redactObject(obj: AnyObj): AnyObj {
  const out: AnyObj = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (key === "authorization" || key === "cookie" || key === "set-cookie") {
      out[k] = "<redacted>";
    } else {
      out[k] = redactValue(v);
    }
  }
  return out;
}

function asMessageArgs(args: unknown[]): unknown[] {
  return args.map((a) => redactValue(a));
}

export const logger = {
  info: (...args: unknown[]) => {
    try {
      // Numeric-only hygiene for calibration logs
      if (args[0] === "emotion.calib.applied" || args[0] === "emotion.calib.canary" || args[0] === "emotion.calib.drift" || args[0] === "emotion.calib.shadow") {
        const out: AnyObj = {};
        const obj = (args[1] && typeof args[1] === "object") ? (args[1] as AnyObj) : {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
        }
        console.info(args[0], out);
        return;
      }
      console.info(...asMessageArgs(args));
    } catch { /* noop */ }
  },
  warn: (...args: unknown[]) => {
    try { console.warn(...asMessageArgs(args)); } catch { /* noop */ }
  },
  error: (...args: unknown[]) => {
    try {
      console.error(...asMessageArgs(args));
      if (process.env.NODE_ENV === "production") {
        const err = args.find((a) => a instanceof Error) as Error | undefined;
        // @ts-ignore
        const cap = (globalThis as any)?.__SENTRY__?.captureException || (globalThis as any)?.Sentry?.captureException;
        if (err && typeof cap === "function") cap(err);
      }
    } catch { /* noop */ }
  },
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") {
      try { console.debug(...asMessageArgs(args)); } catch { /* noop */ }
    }
  },
};
