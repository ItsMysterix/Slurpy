import { test, expect, Page } from "@playwright/test";

async function mockSignedIn(page: Page, firstName = "Testy") {
  await page.addInitScript((name: string) => {
    (window as any).__E2E_AUTH_MOCK__ = {
      useAuth: () => ({ isSignedIn: true, userId: "user_123" }),
      useUser: () => ({ user: { id: "user_123", firstName: name } }),
    };
  }, firstName);
}

test.describe("Chat flow (E2E, mocked APIs)", () => {
  test("sends a message and receives assistant response", async ({ page }) => {
    await mockSignedIn(page);

    // Mock backend endpoints used by chat
    await page.route("**/api/proxy-chat", async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session_id: "sess_e2e", message: "Hello, I'm here to help!", emotion: "calm" }),
        });
      }
      return route.fallback();
    });

    await page.route("**/api/insights*", async (route) => {
      return route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/chat");

    // Greeting should include first name
    await expect(page.getByText(/Hello, Testy/i)).toBeVisible();

  // Type and send a message
  await page.getByRole('textbox', { name: 'Message' }).fill("I feel a bit overwhelmed today");
    await page.getByRole("button", { name: /send message/i }).click();

    // User message appears
    await expect(page.getByText(/I feel a bit overwhelmed today/)).toBeVisible();

    // Assistant response appears (typewriter then commit)
    await expect(page.getByText(/I'm here to help!/i)).toBeVisible({ timeout: 10_000 });
  });
});
