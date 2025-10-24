// lib/safe-fetch.ts
// A thin wrapper around fetch that enforces a host allowlist and optional timeout.

export type SafeFetchInit = RequestInit & {
  timeoutMs?: number;
  allowedHosts?: string[]; // exact hostnames allowed (no ports)
};

function combineSignals(a?: AbortSignal | null, b?: AbortSignal | null): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (!a && b) return b;
  const controller = new AbortController();
  const onAbort = () => {
    try { controller.abort(); } catch {}
    if (a) a.removeEventListener("abort", onAbort);
    if (b) b.removeEventListener("abort", onAbort);
  };
  a!.addEventListener("abort", onAbort);
  b!.addEventListener("abort", onAbort);
  return controller.signal;
}

export async function safeFetch(input: string, init: SafeFetchInit = {}): Promise<Response> {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("safeFetch: only http(s) protocols are allowed");
  }

  // Build default allowlist from BACKEND_URL if present
  const defaultHost = (() => {
    try {
      const u = new URL(process.env.BACKEND_URL || "");
      return u.hostname || undefined;
    } catch {
      return undefined;
    }
  })();
  const allowed = new Set<string>([
    ...(init.allowedHosts || []),
    ...(defaultHost ? [defaultHost] : []),
    "localhost",
    "127.0.0.1",
  ].filter(Boolean) as string[]);

  if (!allowed.has(url.hostname)) {
    throw new Error(`safeFetch: disallowed host ${url.hostname}`);
  }

  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? 20_000;
  const timer = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, timeoutMs);

  try {
    const signal = combineSignals(init.signal as AbortSignal | undefined, controller.signal);
    const resp = await fetch(input, { ...init, signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
