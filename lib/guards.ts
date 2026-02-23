// lib/guards.ts
// Central guard helpers (rate limiting, etc.)

import { NextRequest } from "next/server";
import { optionalAuth } from "@/lib/api-auth";
import { createLimiter } from "@/lib/rate-limit";
import { httpError } from "@/lib/validate";
import { logger } from "@/lib/logger";
import { hashId } from "@/lib/rate-limit";
import { isE2EBypassEnabled } from "@/lib/runtime-safety";

export type GuardRateOptions = {
  key: string; // route key
  limit: number;
  windowMs: number;
};

function ipFrom(req: NextRequest): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xr = h.get("x-real-ip");
  if (xr) return xr;
  return "127.0.0.1";
}

export async function guardRate(req: NextRequest, opts: GuardRateOptions): Promise<Response | undefined> {
  const auth = await optionalAuth(req);
  const id = auth?.userId || ipFrom(req);
  // E2E override for faster tests
  let effLimit = opts.limit;
  if (isE2EBypassEnabled()) {
    const hdr = req.headers.get("x-e2e-rl-limit");
    const n = hdr ? Number(hdr) : NaN;
    if (!Number.isNaN(n) && n > 0) effLimit = n;
  }
  const limiter = createLimiter({ keyPrefix: `rl:${opts.key}`, limit: effLimit, windowMs: opts.windowMs });
  const res = await limiter.check({ id });
  if (!res.ok) {
    const resetSec = Math.max(1, Math.ceil(res.reset / 1000));
    const masked = hashId(id);
    try {
      logger.warn?.(`rate_limit: key=${opts.key} id=${masked} reset=${resetSec}s`);
    } catch {}
    const r = httpError(429, "too many requests");
    r.headers.set("Retry-After", String(resetSec));
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
  return undefined;
}
