import { test, expect } from "@playwright/test";

test.describe("AppError and error responses", () => {
  test("AppError returns code and message without stack", async ({ request }) => {
    const res = await request.get("/api/test-errors?type=app");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "bad_input", message: expect.any(String) });
    const text = JSON.stringify(body);
    expect(text.toLowerCase()).not.toContain("stack");
    expect(text.toLowerCase()).not.toContain("token");
  });

  test("Unknown errors map to internal_error without stack", async ({ request }) => {
    const res = await request.get("/api/test-errors?type=unknown");
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "internal_error" });
    const text = JSON.stringify(body);
    expect(text.toLowerCase()).not.toContain("stack");
    expect(text.toLowerCase()).not.toContain("token");
  });
});
