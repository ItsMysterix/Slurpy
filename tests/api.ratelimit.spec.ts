import { test, expect, request } from "@playwright/test";
import { postJSON } from "./utils/request";

const base = "http://localhost:3000";

async function authed(extra?: Record<string, string>) {
  return await request.newContext({
    baseURL: base,
    extraHTTPHeaders: { "x-e2e-user": "rate-user", "content-type": "application/json", ...(extra || {}) },
  });
}

test.describe("API rate limits", () => {
  test("proxy-chat returns 429 with Retry-After when over cap", async () => {
    const ctx = await authed({ "x-e2e-noop": "1", "x-e2e-rl-limit": "10" });
    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
  const res = await postJSON(ctx, "/api/proxy-chat", { text: `hi ${i}` });
      lastStatus = res.status();
    }
    expect(lastStatus).toBe(429);
  const res = await postJSON(ctx, "/api/proxy-chat", { text: "again" });
    expect(res.status()).toBe(429);
    expect(res.headers()["retry-after"] || res.headers()["Retry-After"]).toBeTruthy();
    await ctx.dispose();
  });

  test("chat-stream 21 starts/min returns 429", async () => {
    const ctx = await authed({ Accept: "application/x-ndjson", "x-e2e-stream": "big" });
    let status = 200;
    for (let i = 0; i < 21; i++) {
      const res = await ctx.post("/api/proxy-chat-stream", { data: { text: `hi ${i}` } });
      status = res.status();
    }
    expect(status).toBe(429);
    await ctx.dispose();
  });

  test("journal write hits cap", async () => {
    const ctx = await authed({ "x-e2e-stub-journal": "1" });
    let status = 201;
    for (let i = 0; i < 21; i++) {
      const res = await postJSON(ctx, "/api/journal", { title: `t${i}`.padEnd(3, "t"), body: "x" });
      status = res.status();
    }
    expect(status).toBe(429);
    await ctx.dispose();
  });

  test("purge-user more than 3/day returns 429", async () => {
    const ctx = await authed();
    let status = 200;
    for (let i = 0; i < 4; i++) {
      const res = await postJSON(ctx, "/api/purge-user", { confirm: "DELETE_MY_ACCOUNT" });
      status = res.status();
    }
    expect(status).toBe(429);
    await ctx.dispose();
  });
});
