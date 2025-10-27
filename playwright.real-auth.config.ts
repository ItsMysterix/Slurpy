import { defineConfig, devices } from "@playwright/test";

// Real-auth test config: does NOT inject auth mocks and does NOT enable auth bypass.
// Assumes you have the app running locally with real Supabase keys and no bypass.
// Recommended: `docker compose -f docker-compose.yml -f docker-compose.test-auth.yml up -d`

export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
