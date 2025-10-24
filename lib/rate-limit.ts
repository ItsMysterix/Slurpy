// lib/rate-limit.ts
// Tiny rate limiter with Redis in prod and in-memory in dev/test.
// API: const limiter = createLimiter({ windowMs, limit, keyPrefix });
//       const { ok, remaining, reset } = await limiter.check({ id })

import { createHash } from "crypto";

export type LimiterOptions = {
  windowMs: number;
  limit: number;
  keyPrefix: string;
};

export type CheckInput = { id: string };
export type CheckResult = { ok: boolean; remaining: number; reset: number };

export type Limiter = {
  check(input: CheckInput): Promise<CheckResult>;
};

const isProdRedisAvailable = () =>
  !!(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    process.env.REDIS_URL
  );

/**
 * Minimal in-memory limiter used in dev/test. Not process-safe or distributed.
 */
// Global in-memory store per keyPrefix so state persists across limiter instances and HMR
const GLOBAL_KEY = "__SLURPY_RL_BUCKETS__";
const MEMORY_BUCKETS: Map<string, Map<string, { count: number; resetAt: number }>> =
  // @ts-ignore
  (globalThis[GLOBAL_KEY] = (globalThis as any)[GLOBAL_KEY] || new Map());

function createMemoryLimiter(opts: LimiterOptions): Limiter {
  const { windowMs, limit, keyPrefix } = opts;
  const buckets = MEMORY_BUCKETS.get(keyPrefix) || new Map<string, { count: number; resetAt: number }>();
  if (!MEMORY_BUCKETS.has(keyPrefix)) MEMORY_BUCKETS.set(keyPrefix, buckets);

  return {
    async check({ id }: CheckInput): Promise<CheckResult> {
      const now = Date.now();
      const bucket = Math.floor(now / windowMs);
      const key = `${keyPrefix}:${id}:${bucket}`;
      const resetAt = (bucket + 1) * windowMs;
      const entry = buckets.get(key);
      if (!entry) {
        buckets.set(key, { count: 1, resetAt });
        return { ok: true, remaining: Math.max(0, limit - 1), reset: resetAt - now };
      }
      entry.count++;
      const ok = entry.count <= limit;
      return { ok, remaining: Math.max(0, limit - entry.count), reset: resetAt - now };
    },
  };
}

/**
 * Upstash Redis REST implementation (best-effort). Falls back to memory if env vars missing.
 * We increment a time-bucketed counter and set TTL ~= windowMs.
 */
function createUpstashLimiter(opts: LimiterOptions): Limiter {
  const { windowMs, limit, keyPrefix } = opts;
  const restUrl = process.env.UPSTASH_REDIS_REST_URL!;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN!;

  async function incrWithTtl(key: string, ttlSec: number): Promise<number> {
    // Use Upstash pipeline: INCR key; EXPIRE key ttl
    const url = `${restUrl}/pipeline`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSec), "NX"],
      ]),
    });
    const json = await res.json().catch(() => null);
    // Expect json like: [{ result: <n> }, { result: 1|0 }]
    const n = Array.isArray(json) && json[0] && typeof json[0].result === "number" ? json[0].result : 0;
    return n;
  }

  return {
    async check({ id }: CheckInput): Promise<CheckResult> {
      const now = Date.now();
      const bucket = Math.floor(now / windowMs);
      const bucketKey = `${keyPrefix}:${id}:${bucket}`;
      const resetAt = (bucket + 1) * windowMs;
      try {
        const count = await incrWithTtl(bucketKey, Math.ceil(windowMs / 1000));
        const ok = count <= limit;
        return { ok, remaining: Math.max(0, limit - count), reset: resetAt - now };
      } catch {
        // fail-open to memory if Upstash has issues
        const fallback = createMemoryLimiter(opts);
        return fallback.check({ id });
      }
    },
  };
}

export function createLimiter(opts: LimiterOptions): Limiter {
  if (isProdRedisAvailable()) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      return createUpstashLimiter(opts);
    }
    // REDIS_URL present but no REST token — fall back to memory; production should prefer Upstash REST
    return createMemoryLimiter(opts);
  }
  return createMemoryLimiter(opts);
}

export function hashId(id: string): string {
  try {
    return createHash("sha256").update(id).digest("hex").slice(0, 12);
  } catch {
    return "unknown";
  }
}
