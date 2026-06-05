import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./src/config";

const isCI = !!process.env.CI;

/**
 * Truly-end-to-end config: a real browser drives the production build of the SPA,
 * served by the real Express backend against a real Postgres + S3 (MinIO). The
 * whole stack is brought up in global-setup.ts (not `webServer`, which would start
 * before globalSetup and so couldn't receive the Testcontainers connection
 * string). `baseURL` points at the backend the harness launches.
 *
 * The suite runs serially (workers: 1, serial mode): dev auth resolves every
 * request to one fixed user, so there's no per-worker isolation to exploit — tests
 * share one DB and reset it between cases (see src/fixtures.ts).
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",

  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,

  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: isCI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: isCI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",
    actionTimeout: isCI ? 15_000 : 10_000,
    navigationTimeout: isCI ? 30_000 : 15_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
