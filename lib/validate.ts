// lib/validate.ts
import { z as _z } from "zod";

export const z = _z;

export function httpError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function sanitizeString(s: string): string {
  // trim, collapse whitespace, drop control chars
  return s
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function boundedString(max = 2_000) {
  return z
    .string()
    .max(max)
    .transform((s) => sanitizeString(s));
}

/** Ensure request body size does not exceed maxBytes. */
export async function ensureJsonUnder(req: Request, maxBytes: number = 64 * 1024): Promise<void> {
  const len = req.headers.get("content-length");
  if (len) {
    const n = Number(len);
    if (!Number.isNaN(n) && n > maxBytes) {
      throw httpError(413, "Payload too large");
    }
  }

  // If content-length missing or chunked, read with a limiter
  const reader = req.body?.getReader?.();
  if (!reader) return; // nothing to read

  let read = 0;
  const limit = maxBytes + 1; // trip if strictly larger
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      read += value.byteLength;
      if (read > limit) {
        reader.cancel().catch(() => {});
        throw httpError(413, "Payload too large");
      }
    }
  }
}
