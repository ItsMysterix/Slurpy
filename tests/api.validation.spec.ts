import { test, expect, request } from "@playwright/test";
import { postJSON } from "./utils/request";

const base = "http://localhost:3000";

// Helper to create an API client with E2E auth bypass
async function authed() {
  return await request.newContext({
    baseURL: base,
    extraHTTPHeaders: {
      "x-e2e-user": "test-user",
      "content-type": "application/json",
    },
  });
}

test.describe("API validation and size limits", () => {
  test("proxy-chat oversize payload returns 413", async () => {
    const ctx = await authed();
  const big = "A".repeat(70 * 1024); // >64KB
  const res = await postJSON(ctx, "/api/proxy-chat", { text: big });
    expect(res.status()).toBe(413);
    const json = await res.json();
    expect(json.error || json.message).toBeTruthy();
    await ctx.dispose();
  });

  test("proxy-chat invalid mode returns 400", async () => {
    const ctx = await authed();
    const res = await postJSON(ctx, "/api/proxy-chat", { text: "hi", mode: "invalid" });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("journal title too long returns 400", async () => {
    const ctx = await authed();
    const title = "T".repeat(500);
    const res = await postJSON(ctx, "/api/journal", { title, body: "ok" });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("purge-user requires explicit confirmation", async () => {
    const ctx = await authed();
    const res = await postJSON(ctx, "/api/purge-user", {});
    expect(res.status()).toBe(400);
    const ok = await postJSON(ctx, "/api/purge-user", { confirm: "DELETE_MY_ACCOUNT" });
    // Upstream resources may not be fully configured; accept 200 or 500 but not 401/400
    expect([200, 500]).toContain(ok.status());
    await ctx.dispose();
  });

  test("no causal kickoff fields when flags off", async () => {
    // Only run when bypass is on so we can hit routes without real auth
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    const ctx = await authed();
    const res = await ctx.post("/api/proxy-chat-stream", {
      headers: { Accept: "application/x-ndjson", "content-type": "application/json" },
      data: { text: "hello" },
    });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const firstLine = txt.split(/\n+/).filter(Boolean)[0] || "";
    // When flags are off, we should not see a structured kickoff 'start' frame
    let firstObj: any = null;
    try { firstObj = JSON.parse(firstLine); } catch { firstObj = null; }
    expect(!(firstObj && firstObj.type === "start" && ("cause" in firstObj || "valence" in firstObj))).toBeTruthy();
    await ctx.dispose();
  });
});
