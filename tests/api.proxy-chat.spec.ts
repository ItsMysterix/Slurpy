import { test, expect, request } from "@playwright/test";

const base = "http://localhost:3000";

async function ctx(user: string, headers?: Record<string, string>) {
  return await request.newContext({ baseURL: base, extraHTTPHeaders: { "x-e2e-user": user, ...(headers || {}) } });
}

test.describe("proxy-chat tenant forwarding", () => {
  test("server forwards tenant id of requester", async () => {
    const A = await ctx("user_A");
    const res = await A.post("/api/proxy-chat", { data: { text: "hello", e2e: "echo-tenant" } });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json?.meta?.forwardedTenant).toBe("user_A");
    await A.dispose();
  });
});
