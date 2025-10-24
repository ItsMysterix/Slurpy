// lib/csrf.ts
import type { NextRequest } from "next/server";
import { httpError } from "@/lib/validate";

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

function originOf(urlLike?: string | null): string | null {
  if (!urlLike) return null;
  try {
    const u = new URL(urlLike);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function methodNeedsCSRF(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export async function assertSameOrigin(req: NextRequest, allowedOrigins?: string[]): Promise<Response | undefined> {
  const allow = allowedOrigins && allowedOrigins.length ? allowedOrigins : parseOrigins();
  const method = req.method.toUpperCase();
  if (!methodNeedsCSRF(method)) return undefined;

  // Heuristic: enforce only if request likely comes from a browser context
  const hasBrowserSignals = !!(req.headers.get("origin") || req.headers.get("sec-fetch-site"));
  if (!hasBrowserSignals) return undefined;

  const origin = originOf(req.headers.get("origin"));
  const referer = originOf(req.headers.get("referer"));

  if (origin && allow.includes(origin)) return undefined;
  if (referer && allow.includes(referer)) return undefined;

  return httpError(403, "csrf");
}

/** Optional double-submit check: when cookie 'slurpy.csrf' is present, require matching x-csrf header. */
export function assertDoubleSubmit(req: NextRequest): Response | undefined {
  const cookie = req.headers.get("cookie") || "";
  const match = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(cookie);
  const token = match ? decodeURIComponent(match[1]) : "";
  if (token) {
    const header = req.headers.get("x-csrf") || "";
    if (!header || header !== token) {
      return httpError(403, "csrf");
    }
  }
  return undefined;
}
