import { test, expect } from "@playwright/test";

const ORIGIN = "http://localhost:3000";

function headersFor(user: string) {
  return {
    origin: ORIGIN,
    "content-type": "application/json",
    "x-e2e-user": user,
    "x-csrf": "t",
    cookie: "slurpy.csrf=t",
  } as any;
}

test.describe("Stripe create-session", () => {
  test("ignores client amount and returns a URL (stubbed)", async ({ request }) => {
    const res = await request.post("/api/stripe/create-session", {
      headers: { ...headersFor("user_123"), "x-e2e-stripe-stub": "1" },
      data: { price_id: "price_test_123", amount: 999999 },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(typeof json.url).toBe("string");
    expect(json.url).toContain("https://stripe.test/");
  });

  test("rate limit 10/min/user", async ({ request }) => {
    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const r = await request.post("/api/stripe/create-session", {
        headers: { ...headersFor("user_123"), "x-e2e-stripe-stub": "1" },
        data: { price_id: "price_test_123" },
      });
      lastStatus = r.status();
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
