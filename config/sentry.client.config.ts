import * as Sentry from "@sentry/nextjs";

function scrubEvent(event: any): any | null {
  try {
    // Redact request headers and bodies for API routes
    if (event.request) {
      const req = event.request as any;
      if (req.headers) {
        const headers = { ...req.headers };
        for (const k of Object.keys(headers)) {
          const lk = k.toLowerCase();
          if (lk === "cookie" || lk === "authorization" || lk.startsWith("x-") || lk.includes("token")) {
            headers[k] = "<redacted>";
          }
        }
        req.headers = headers;
      }
      const url: string | undefined = (req.url as any) || (event.request as any).url;
      if (url && url.includes("/api/")) {
        delete (req as any).data; // drop body entirely for API routes
      }
    }

    // Redact user email/name
  if (event.user) {
      if ((event.user as any).email) (event.user as any).email = "<redacted:email>";
      if ((event.user as any).username) (event.user as any).username = "<redacted>";
      if ((event.user as any).ip_address) (event.user as any).ip_address = "<redacted>";
    }

    // Defensive scrub on extra/tags
    const redactDeep = (obj: any) => {
      if (!obj || typeof obj !== "object") return obj;
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === "string") {
          if (k.toLowerCase().includes("token") || k.toLowerCase().includes("cookie")) {
            obj[k] = "<redacted>";
          } else {
            obj[k] = v.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted:email>");
          }
        } else if (v && typeof v === "object") {
          obj[k] = redactDeep(v);
        }
      }
      return obj;
    };
  if (event.extra) event.extra = redactDeep(event.extra);
  if (event.tags) event.tags = redactDeep(event.tags);
  } catch {
    // ignore scrub failures
  }
  return event;
}

const clientEnabled = !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) && process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true";
if (clientEnabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    beforeSend(event: any, _hint: any) {
      return scrubEvent(event);
    },
  });
}

// Expose minimal global for edge-friendly capture in helpers
// @ts-ignore
(globalThis as any).__SENTRY__ = {
  captureException: (e: unknown) => {
    try { if (clientEnabled) Sentry.captureException(e); } catch {}
  },
};
