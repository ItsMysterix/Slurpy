// lib/cors.ts
import type { NextRequest } from "next/server";

export type CORSOptions = {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
};

function parseOrigins(): string[] {
  const env = process.env.CORS_ORIGINS || "";
  const fromEnv = env.split(",").map(s => s.trim()).filter(Boolean);
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
  ];
  const set = new Set<string>([...fromEnv, ...defaults]);
  return Array.from(set);
}

function normalizeOrigin(o?: string | null): string | null {
  if (!o) return null;
  try {
    const u = new URL(o);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isAllowed(origin: string | null, allow: string[]): origin is string {
  if (!origin) return false;
  return allow.includes(origin);
}

function buildHeaders(origin: string, opts: Required<CORSOptions>) {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin);
  if (opts.credentials) h.set("Access-Control-Allow-Credentials", "true");
  h.set("Vary", "Origin");
  return h;
}

export function withCORS<T extends (req: NextRequest) => Promise<Response>>(handler: T, options?: CORSOptions) {
  const opts: Required<CORSOptions> = {
    origins: options?.origins && options.origins.length ? options.origins : parseOrigins(),
    methods: options?.methods && options.methods.length ? options.methods : ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers: options?.headers && options.headers.length ? options.headers : [
      "content-type",
      "authorization",
      "x-e2e-user",
      "x-e2e-stream",
      "x-e2e-rl-limit",
      "x-e2e-stub-journal",
      "x-csrf",
    ],
    credentials: options?.credentials ?? true,
  };

  return async function wrapped(req: NextRequest): Promise<Response> {
    const origin = normalizeOrigin(req.headers.get("origin"));

    // Preflight
    if (req.method === "OPTIONS") {
      if (!isAllowed(origin, opts.origins)) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
      }
      const h = buildHeaders(origin!, opts);
      h.set("Access-Control-Allow-Methods", opts.methods.join(","));
      h.set("Access-Control-Allow-Headers", opts.headers.join(","));
      // 204 No Content for preflight
      return new Response(null, { status: 204, headers: h });
    }

    // Actual request: if cross-origin, validate
    if (origin && !isAllowed(origin, opts.origins)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
    }

    const res = await handler(req);
    // For allowed origins: set ACAO and credentials
    if (origin && isAllowed(origin, opts.origins)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      if (opts.credentials) res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.append("Vary", "Origin");
    }
    return res;
  } as T;
}
