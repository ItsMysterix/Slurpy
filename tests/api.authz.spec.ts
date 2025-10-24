import { test, expect, request } from "@playwright/test";

const base = "http://localhost:3000";

async function ctx(user: string, roles?: string) {
  return await request.newContext({
    baseURL: base,
    extraHTTPHeaders: { "x-e2e-user": user, ...(roles ? { "x-e2e-roles": roles } : {}) },
  });
}

test.describe("authz and tenant scoping", () => {
  test("A cannot read B's journal list (403)", async () => {
    const A = await ctx("user_A");
    const res = await A.get("/api/journal?userId=user_B");
    expect(res.status()).toBe(403);
    await A.dispose();
  });

  test("ops can read other's journal list", async () => {
    const ops = await ctx("user_ops", "ops");
    const res = await ops.get("/api/journal?userId=user_A");
    // Data may be empty without a DB, but status should allow access
    expect([200, 204]).toContain(res.status());
    await ops.dispose();
  });

  test("admin can read other's journal list", async () => {
    const admin = await ctx("user_admin", "admin");
    const res = await admin.get("/api/journal?userId=user_A");
    expect([200, 204]).toContain(res.status());
    await admin.dispose();
  });
});
