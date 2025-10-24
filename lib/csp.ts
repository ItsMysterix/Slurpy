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
    "https://*.clerk.com",
    "https://*.clerk.services",
  ];
  if (isDev) {
    connect.push("ws://localhost:*", "http://localhost:*");
  }
  // Join arrays to form a strict CSP string
  return [
    "default-src 'none'",
    "base-uri 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "frame-src https://*.stripe.com https://*.clerk.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
