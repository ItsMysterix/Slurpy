import { randomBytes } from "crypto";

export function makeNonce(): string {
  // 16 bytes → 128 bits of entropy, base64url encoded
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function cspHeader({ nonce, isDev }: { nonce: string; isDev: boolean }): string {
  const connect = [
    "'self'",
    "https://*.supabase.co",
    "https://api.openai.com",
    "https://*.qdrant.io",
    "https://*.stripe.com",
  ];
  // Allow additional origins via env (comma-separated)
  const extra = (process.env.NEXT_PUBLIC_EXTRA_CONNECT_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of extra) {
    try {
      const u = new URL(origin);
      const o = `${u.protocol}//${u.host}`;
      if (!connect.includes(o)) connect.push(o);
    } catch {}
  }
  if (isDev) {
    connect.push("ws://localhost:*", "http://localhost:*");
  }
  // Join arrays to form a strict CSP string
  const frame = ["https://*.stripe.com"]; 
  for (const origin of extra) {
    try { const u = new URL(origin); const o = `${u.protocol}//${u.host}`; if (!frame.includes(o)) frame.push(o); } catch {}
  }

  // Build script-src and enable eval in dev (Next.js dev tooling)
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
  ];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'none'",
    "base-uri 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frame.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
