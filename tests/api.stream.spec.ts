import { test, expect, request } from "@playwright/test";

const base = "http://localhost:3000";

async function authed(headers?: Record<string, string>) {
  return await request.newContext({
    baseURL: base,
    extraHTTPHeaders: { "x-e2e-user": "test-user", Authorization: "Bearer e2e", ...(headers || {}) },
  });
}

test.describe("proxy-chat-stream burst caps", () => {
  test("caps to 5000 deltas and ends with done", async () => {
    const ctx = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-stream": "big" });
    const res = await ctx.post("/api/proxy-chat-stream", { data: { text: "hello" } });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const lines = txt.split(/\n+/).filter(Boolean);
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
    const deltas = events.filter(e => e.type === "delta");
    const done = events[events.length - 1];
    expect(deltas.length).toBeLessThanOrEqual(5000);
    expect(done && done.type === "done").toBeTruthy();
    await ctx.dispose();
  });
  test("emits rate_limited error when over cap mid-stream", async () => {
    const ctx = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-stream": "big", "x-e2e-stream-limit": "50" });
    const res = await ctx.post("/api/proxy-chat-stream", { data: { text: "hello" } });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const lines = txt.split(/\n+/).filter(Boolean);
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
    const last = events[events.length - 1];
    expect(last && last.type === "error" && last.reason === "rate_limited").toBeTruthy();
    await ctx.dispose();
  });

  test("kickoff includes causal payload when flags enabled (e2e)", async () => {
    // Only run when E2E bypass is on; otherwise skip
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    const ctx = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-cel": "true" });
    const res = await ctx.post("/api/proxy-chat-stream", { data: { text: "i'm fine lol but actually crying 😭" } });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const lines = txt.split(/\n+/).filter(Boolean);
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
    // The first event should be a start payload when flags are on
    const first = events[0];
    expect(first && first.type === "start").toBeTruthy();
    // Check compact causal fields exist with correct types
    expect(Array.isArray(first.emotions) || first.emotions === undefined).toBeTruthy();
    if (typeof first.valence !== "undefined") expect(typeof first.valence).toBe("number");
    if (typeof first.arousal !== "undefined") expect(typeof first.arousal).toBe("number");
    if (typeof first.cause !== "undefined") expect(typeof first.cause).toBe("string");
    if (typeof first.target !== "undefined") expect(["string", "object"]).toContain(typeof first.target); // null allowed
    if (typeof first.masking !== "undefined") expect(typeof first.masking).toBe("boolean");
    await ctx.dispose();
  });

  test("kickoff includes personalization hint when EMOTION_PERSONALIZE is on (e2e)", async () => {
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    const ctx = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-personalize": "true" });
    const res = await ctx.post("/api/proxy-chat-stream", { data: { text: "feeling weird today" } });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const firstLine = txt.split(/\n+/).filter(Boolean)[0] || "";
    let firstObj: any = null;
    try { firstObj = JSON.parse(firstLine); } catch { firstObj = null; }
    expect(firstObj && firstObj.type === "start").toBeTruthy();
    // personalization fields
    if (typeof firstObj.tone !== "undefined") expect(typeof firstObj.tone).toBe("string");
    if (typeof firstObj.budgetMultiplier !== "undefined") expect(typeof firstObj.budgetMultiplier).toBe("number");
    if (typeof firstObj.dev !== "undefined") expect(typeof firstObj.dev).toBe("number");
    await ctx.dispose();
  });

  test("kickoff payload shape unchanged with calibration env present (e2e)", async () => {
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    const ctx = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-cel": "true", "x-e2e-personalize": "true" });
    const res = await ctx.post("/api/proxy-chat-stream", { data: { text: "check shape" } });
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    const firstLine = txt.split(/\n+/).filter(Boolean)[0] || "";
    let firstObj: any = null;
    try { firstObj = JSON.parse(firstLine); } catch { firstObj = null; }
    expect(firstObj && firstObj.type === "start").toBeTruthy();
    // Shape assertions: only known fields may appear
    const allowed = new Set(["type","emotions","valence","arousal","target","cause","masking","tone","budgetMultiplier","dev"]);
    for (const k of Object.keys(firstObj)) {
      expect(allowed.has(k)).toBeTruthy();
    }
    await ctx.dispose();
  });

  test("health exposes emotionCalib loaded/canaryOk/hash (e2e)", async () => {
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    const ctx = await authed();
    const res = await ctx.get(`/api/health`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json && typeof json === "object").toBeTruthy();
    const ec = json.emotionCalib;
    expect(ec && typeof ec === "object").toBeTruthy();
    expect(typeof ec.loaded).toBe("boolean");
    expect(typeof ec.canaryOk).toBe("boolean");
    expect(typeof ec.hash).toBe("number");
    await ctx.dispose();
  });

  test("AB lowers calming threshold deterministically (e2e)", async () => {
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true", "E2E bypass not enabled");
    // Control (AB off): dev=0.95 below control threshold ~1.0 → tone normal
    const baseHeaders = { Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-personalize": "true" } as const;

    // Control
    const ctxControl = await authed({ ...baseHeaders, "x-e2e-ab": "0", "x-e2e-dev": "0.95" });
    const resControl = await ctxControl.post("/api/proxy-chat-stream", { data: { text: "trigger" } });
    expect(resControl.ok()).toBeTruthy();
    const txtControl = await resControl.text();
    const firstControlLine = txtControl.split(/\n+/).filter(Boolean)[0] || "";
    let startControl: any = null;
    try { startControl = JSON.parse(firstControlLine); } catch { startControl = null; }
    expect(startControl && startControl.type === "start").toBeTruthy();
    const toneControl = startControl?.tone;
    const multControl = startControl?.budgetMultiplier;
    expect(toneControl).toBe("normal");
    expect(typeof multControl).toBe("number");
    expect(multControl).toBeGreaterThanOrEqual(0.6);
    expect(multControl).toBeLessThanOrEqual(1.1);
    await ctxControl.dispose();

    // AB on: threshold is 0.8; dev=0.95 → tone calming and multiplier greater than control
    const ctxAB = await authed({ ...baseHeaders, "x-e2e-ab": "1", "x-e2e-dev": "0.95" });
    const resAB = await ctxAB.post("/api/proxy-chat-stream", { data: { text: "trigger" } });
    expect(resAB.ok()).toBeTruthy();
    const txtAB = await resAB.text();
    const firstABLine = txtAB.split(/\n+/).filter(Boolean)[0] || "";
    let startAB: any = null;
    try { startAB = JSON.parse(firstABLine); } catch { startAB = null; }
    expect(startAB && startAB.type === "start").toBeTruthy();
    const toneAB = startAB?.tone;
    const multAB = startAB?.budgetMultiplier;
    expect(toneAB).toBe("calming");
    expect(typeof multAB).toBe("number");
    expect(multAB).toBeGreaterThan(multControl);
    await ctxAB.dispose();
  });

  test("E2E overrides are ignored when bypass is off (regression)", async () => {
    test.skip(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true", "Requires bypass OFF");
    // Baseline call (no overrides)
    const ctxBase = await authed({ Accept: "application/x-ndjson", "content-type": "application/json" });
    const resBase = await ctxBase.post("/api/proxy-chat-stream", { data: { text: "trigger" } });
    expect(resBase.ok()).toBeTruthy();
    const txtBase = await resBase.text();
    const firstBaseLine = txtBase.split(/\n+/).filter(Boolean)[0] || "";
    let startBase: any = null;
    try { startBase = JSON.parse(firstBaseLine); } catch { startBase = null; }
    // If personalization start payload isn't present in prod env, skip this regression test
    if (!startBase || startBase.type !== "start" || typeof startBase.tone === "undefined" || typeof startBase.budgetMultiplier === "undefined") {
      test.skip(true, "Personalization not enabled in prod env; skipping regression assertion");
    }
    const toneBase = startBase.tone;
    const multBase = startBase.budgetMultiplier;
    expect(["normal","calming","direct"]).toContain(toneBase);
    expect(typeof multBase).toBe("number");
    expect(multBase).toBeGreaterThanOrEqual(0.6);
    expect(multBase).toBeLessThanOrEqual(1.1);
    await ctxBase.dispose();

    // Call with E2E override headers (should be ignored)
    const ctxOverride = await authed({ Accept: "application/x-ndjson", "content-type": "application/json", "x-e2e-dev": "3.8", "x-e2e-ab": "1" });
    const resOverride = await ctxOverride.post("/api/proxy-chat-stream", { data: { text: "trigger" } });
    expect(resOverride.ok()).toBeTruthy();
    const txtOverride = await resOverride.text();
    const firstOverrideLine = txtOverride.split(/\n+/).filter(Boolean)[0] || "";
    let startOverride: any = null;
    try { startOverride = JSON.parse(firstOverrideLine); } catch { startOverride = null; }
    // If not present, skip for same reason
    if (!startOverride || startOverride.type !== "start" || typeof startOverride.tone === "undefined" || typeof startOverride.budgetMultiplier === "undefined") {
      test.skip(true, "Personalization not enabled in prod env; skipping regression assertion");
    }
    const toneOverride = startOverride.tone;
    const multOverride = startOverride.budgetMultiplier;
    // Assert no change due to overrides when bypass is off
    expect(toneOverride).toBe(toneBase);
    expect(multOverride).toBe(multBase);
    await ctxOverride.dispose();
  });
});
