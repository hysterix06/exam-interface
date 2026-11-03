import { defineConfig } from "@playwright/test";

// E2E runs against the seeded demo accounts (npm run db:seed) and a real
// Supabase project, so it needs .env.local. Tests are serial: they share one
// demo exam and clean up its attempts.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
