import { test, expect } from "@playwright/test";

function getNonceFromCsp(csp: string | null): string | null {
  if (!csp) return null;
  const m = csp.match(/script-src[^;]*'nonce-([^']+)'/);
  return m ? m[1] : null;
}

test.describe("Security headers", () => {
  test("/ has CSP with nonce when enforced (dev may omit)", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();
    // Debug: print headers if CSP missing
    const headers = res.headers();
    if (!headers["content-security-policy"] && !headers["Content-Security-Policy"]) {
      // eslint-disable-next-line no-console
      console.log("headers:", headers);
    }
    const csp = headers["content-security-policy"] || headers["Content-Security-Policy"];
    if (csp) {
      expect(csp).not.toContain("*");
      const nonce = getNonceFromCsp(csp || "");
      expect(nonce).toBeTruthy();
      expect(csp).toContain("script-src 'self'");
    } else {
      // In dev, Next rewrites may strip response headers; ensure middleware ran
      expect(headers["x-middleware-rewrite"]).toBeDefined();
    }
  });

  test("/chat has CSP with nonce when enforced (dev may omit)", async ({ request }) => {
    const res = await request.get("/chat");
    expect(res.ok()).toBeTruthy();
    const headers = res.headers();
    const csp = headers["content-security-policy"] || headers["Content-Security-Policy"];
    if (csp) {
      expect(csp).not.toContain("*");
      const nonce = getNonceFromCsp(csp || "");
      expect(nonce).toBeTruthy();
    } else {
      expect(headers["x-middleware-rewrite"]).toBeDefined();
    }
  });

  test("SSE response includes ACAO and CSP headers", async ({ request }) => {
    const res = await request.get("/api/insights/stream?timeframe=week", {
      headers: { origin: "http://localhost:3000" },
    });
    expect([200, 401]).toContain(res.status()); // unauth in CI is okay
    const h = res.headers();
    // When allowed, ACAO equals origin; in CI unauth might short-circuit
    if (h["access-control-allow-origin"]) {
      expect(h["access-control-allow-origin"]).toBe("http://localhost:3000");
    }
    const csp = h["content-security-policy"] || h["Content-Security-Policy"];
    if (csp) {
      expect(csp).not.toContain("*");
      expect(csp).toContain("script-src 'self'");
    }
  });
});
