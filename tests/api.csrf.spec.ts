import { test, expect } from "@playwright/test";

const ORIGIN = "http://localhost:3000";

const payload = { title: "t", content: "c", date: new Date().toISOString(), is_private: true };

test.describe("CSRF double submit", () => {
  test("mismatch token blocks request", async ({ request }) => {
    const res = await request.post("/api/journal", {
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-e2e-user": "user_123",
        "x-e2e-stub-journal": "1",
  cookie: "slurpy.csrf=token123",
        "x-csrf": "wrong",
      } as any,
      data: payload,
    });
    expect(res.status()).toBe(403);
  });

  test("matching token allows request", async ({ request }) => {
    const res = await request.post("/api/journal", {
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-e2e-user": "user_123",
        "x-e2e-stub-journal": "1",
  cookie: "slurpy.csrf=token123",
        "x-csrf": "token123",
      } as any,
      data: payload,
    });
    expect(res.ok()).toBeTruthy();
  });
});
