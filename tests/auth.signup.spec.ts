import { test, expect, Page } from '@playwright/test'

// Helper to inject E2E Clerk mocks before the app runs
async function mockClerk(page: Page, variant: 'verify' | 'complete' | 'oauth') {
  await page.addInitScript((mode: 'verify' | 'complete' | 'oauth') => {
    (window as any).__E2E_AUTH_MOCK__ = {
      useAuth: () => ({ isSignedIn: false }),
      useSignUp: () => ({
        isLoaded: true,
        signUp: {
          create: async (args: any) => {
            if (mode === 'complete') {
              return { status: 'complete', createdSessionId: 'sess_123' }
            }
            // Default to requiring email verification
            return { status: 'missing_requirements' }
          },
          prepareEmailAddressVerification: async () => ({ ok: true }),
          authenticateWithRedirect: async () => {
            if (mode === 'oauth') {
              // Simulate Clerk redirect completing sign-up and taking user to /chat
              window.location.href = '/chat'
            }
          },
        },
        setActive: async () => ({ ok: true }),
      }),
    }
  }, variant)
}

const fillForm = async (page: Page) => {
  await page.getByLabel(/first name/i).fill('Jane')
  await page.getByLabel(/last name/i).fill('Doe')
  await page.getByLabel(/username/i).fill('janedoe')
  await page.getByLabel(/email address/i).fill('jane@example.com')
  await page.getByLabel(/^password$/i).fill('StrongPass123!')
}

test.describe('Sign-up flow (E2E, mocked Clerk)', () => {
  test('navigates to email verification screen when verification is required', async ({ page }) => {
    await mockClerk(page, 'verify')
    await page.goto('/sign-up')

    // Basic page load assertion
    await expect(page).toHaveURL(/\/sign-up$/)

    await fillForm(page)
    await page.getByRole('button', { name: /create account/i }).click()

    // Should route to verification page with encoded email
    await expect(page).toHaveURL(/\/email-verify-page\?email=jane%40example\.com$/)
  })

  test('completes immediately and routes to /chat (or sign-in redirect)', async ({ page }) => {
    await mockClerk(page, 'complete')
    await page.goto('/sign-up')

    await fillForm(page)
    await page.getByRole('button', { name: /create account/i }).click()

    // Middleware may protect /chat and redirect to /sign-in if there is no
    // server-side session (which our client-side mock doesn't create). Accept
    // either final URL as success for this mocked e2e.
    await page.waitForURL((u: URL) => /\/chat$/.test(u.toString()) || /\/sign-in\?redirect_url=%2Fchat$/.test(u.toString()))
  })

  test('Google sign-up button triggers OAuth redirect flow', async ({ page }) => {
    await mockClerk(page, 'oauth')
    await page.goto('/sign-up')

    // Click the Google button
    await page.getByRole('button', { name: /continue with google/i }).click()

    // Our mock sets window.location to /chat; middleware may redirect to sign-in
    await page.waitForURL((u: URL) => /\/chat$/.test(u.toString()) || /\/sign-in\?redirect_url=%2Fchat$/.test(u.toString()))
  })
})
