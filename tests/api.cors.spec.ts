import { test, expect, request as pwRequest } from "@playwright/test";

// These tests validate our centralized CORS helper behavior on state-changing endpoints.
// We use /api/journal because it is wrapped with withCORS and supports an E2E stub path.

const ALLOWED_ORIGIN = "http://localhost:3000"; // default allowlist in withCORS
const BAD_ORIGIN = "https://evil.example";

// Preflight from allowed origin should succeed with 204 and ACAO=origin
// Preflight from disallowed origin should be blocked with 403

 test.describe("CORS preflight", () => {
  test("OPTIONS from allowed origin returns 204 with ACAO", async ({ request }) => {
    const res = await request.fetch("/api/journal", {
      method: "OPTIONS",
      headers: {
        origin: ALLOWED_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-e2e-user,x-e2e-stub-journal,x-csrf",
      },
    });
    expect(res.status()).toBe(204);
    expect(res.headers()["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers()["access-control-allow-methods"])?.toContain("POST");
  });

  test("OPTIONS from disallowed origin returns 403", async ({ request }) => {
    const res = await request.fetch("/api/journal", {
      method: "OPTIONS",
      headers: {
        origin: BAD_ORIGIN,
        "access-control-request-method": "POST",
      },
    });
    expect(res.status()).toBe(403);
  });
});

// Actual POST from disallowed origin should be blocked with 403 too.
// Use E2E user bypass and stub header to avoid DB.

test("POST from disallowed origin is forbidden", async ({ request }) => {
  const res = await request.post("/api/journal", {
    headers: {
      origin: BAD_ORIGIN,
      "content-type": "application/json",
      "x-e2e-user": "user_123",
      "x-e2e-stub-journal": "1",
  // Include a CSRF cookie/header to ensure failure is due to origin allowlist, not missing token
  cookie: "slurpy.csrf=test",
      "x-csrf": "test",
    } as any,
    data: { title: "t", content: "c", date: new Date().toISOString(), is_private: true },
  });
  expect(res.status()).toBe(403);
});
