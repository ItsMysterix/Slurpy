import { test, expect, Page } from "@playwright/test";

async function mockSignedIn(page: Page, firstName = "Testy") {
  await page.addInitScript((name: string) => {
    (window as any).__E2E_AUTH_MOCK__ = {
      useAuth: () => ({ isSignedIn: true, userId: "user_123" }),
      useUser: () => ({ user: { id: "user_123", firstName: name } }),
    };
  }, firstName);
}

test.describe("Journal (E2E, mocked APIs)", () => {
  test("loads empty list, saves, edits and deletes an entry", async ({ page }) => {
    await mockSignedIn(page);

    // Mock GET (empty list)
    await page.route("**/api/journal?*", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      return route.fallback();
    });

    // Mock POST (save)
  await page.route("**/api/journal*", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        const body = await route.request().postDataJSON();
        const saved = {
          id: "entry_e2e_1",
          title: body.title,
          content: body.content,
          mood: body.mood ?? null,
          fruit: body.fruit ?? null,
          tags: body.tags ?? [],
          userId: "user_123",
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(saved) });
      } else if (method === "PUT") {
        const body = await route.request().postDataJSON();
        const updated = {
          id: body.id,
          title: body.title,
          content: body.content,
          mood: body.mood ?? null,
          fruit: body.fruit ?? null,
          tags: body.tags ?? [],
          userId: "user_123",
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updated) });
      } else if (method === "DELETE") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }
      return route.fallback();
    });

  await page.goto("/journal", { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /journal/i })).toBeVisible();

  // Open the new entry form via header button (more robust than empty-state CTA)
  await page.getByRole('button', { name: /new entry/i }).click();

    // Fill form and save
    await page.getByPlaceholder("Entry title...").fill("My first E2E journal");
    await page.getByPlaceholder("What's on your mind today?").fill("Today I tested the journal feature.");
    await page.getByRole("button", { name: /save entry/i }).click();

  // Entry renders in list (collapsed by default), then expand to see content
  await expect(page.getByText(/My first E2E journal/)).toBeVisible();
  await page.getByTitle(/expand/i).first().click();
    await expect(page.getByText(/Today I tested the journal feature\./)).toBeVisible();

    // Edit the entry
    await page.getByTitle(/edit/i).first().click();
    const editArea = page.getByPlaceholder(/write your thoughts/i);
    await editArea.fill("Updated content via E2E test.");
    await page.getByTitle(/save/i).click();

    // Expand again (if needed) and assert updated content
    const maybeExpand = page.getByTitle(/expand/i).first();
    if (await maybeExpand.count()) {
      await maybeExpand.click();
    }
    await expect(page.getByText(/Updated content via E2E test\./)).toBeVisible();

    // Delete the entry
  await page.getByTitle(/delete/i).first().click();
  // Accept the browser confirm from page handler
  page.once('dialog', (d) => d.accept());
  await page.getByTitle(/confirm delete/i).click();
  await expect(page.getByText(/My first E2E journal/)).toHaveCount(0, { timeout: 15000 });
  });
});
