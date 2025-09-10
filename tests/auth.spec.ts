import { test, expect } from "@playwright/test"

test.describe("Authentication", () => {
  test("sign-up screen renders", async ({ page }) => {
    await page.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" })

    // Assert URL
    await expect(page).toHaveURL(/\/sign-up$/)

    // Clerk usually renders one of these:
    const emailInput = page.locator('input[name="emailAddress"], input[type="email"]')
    const continueBtn = page.getByRole("button", { name: /continue/i })

    await expect(emailInput.first()).toBeVisible({ timeout: 10_000 })
    await expect(continueBtn).toBeVisible()
  })

  test("sign-in screen renders", async ({ page }) => {
    await page.goto("http://localhost:3000/sign-in", { waitUntil: "networkidle" })

    // Assert URL
    await expect(page).toHaveURL(/\/sign-in$/)

    const emailInput = page.locator('input[name="identifier"], input[name="emailAddress"], input[type="email"]')
    const continueBtn = page.getByRole("button", { name: /continue/i })

    await expect(emailInput.first()).toBeVisible({ timeout: 10_000 })
    await expect(continueBtn).toBeVisible()
  })
})
