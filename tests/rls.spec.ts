import { test, expect } from "@playwright/test";

// These tests assert API-level tenant isolation. We prefer 403 for cross-tenant attempts.
// We use /api/journal GET with a 'userId' query param, which enforces a self-or-role check before DB access.

const ORIGIN = "http://localhost:3000";

function headersFor(user: string) {
  return {
    origin: ORIGIN,
    "content-type": "application/json",
    "x-e2e-user": user,
  } as any;
}

test.describe("RLS API isolation (journal)", () => {
  test("A can list own entries (200), B cannot list A's entries (403)", async ({ request }) => {
    // A requests own journal list
    const resA = await request.get("/api/journal", { headers: headersFor("user_A") });
    expect(resA.ok()).toBeTruthy();

    // B tries to read A's entries by specifying userId=A → 403 from API layer
    const resB = await request.get("/api/journal?userId=user_A", { headers: headersFor("user_B") });
    expect(resB.status()).toBe(403);
  });

  test("B cannot GET a specific id for A (403), A can GET self (200 or 404)", async ({ request }) => {
    // A fetches list first to derive behavior; even if empty, should be 200
    const listA = await request.get("/api/journal", { headers: headersFor("user_A") });
    expect(listA.ok()).toBeTruthy();

    // B attempts to request a specific id for A's namespace using userId=A hint
    const resB = await request.get("/api/journal?id=fake-id&userId=user_A", { headers: headersFor("user_B") });
    expect(resB.status()).toBe(403);

    // A requests a specific id in own namespace; will be 404 if not present, which is acceptable
    const resA = await request.get("/api/journal?id=fake-id", { headers: headersFor("user_A") });
    expect([200, 404]).toContain(resA.status());
  });
});
