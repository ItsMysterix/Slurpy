import { test, expect } from "@playwright/test";

test.describe("server auth enforcement", () => {
  test("unauthenticated POST /api/proxy-chat returns 401", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/proxy-chat`, {
      data: { text: "hello" },
    });
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json?.error || json?.message).toBeTruthy();
  });
});
