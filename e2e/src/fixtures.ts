import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { LANG_STORAGE_KEY, TEST_LOCALE } from "./config";

/**
 * Pin the app locale before any page script runs. The app deliberately doesn't
 * detect the browser language (frontend/src/i18n/index.ts) — it reads this
 * localStorage key at module init — so the context `locale` option has no effect;
 * an init script is the right lever. We pin to English for stable selectors.
 */
async function pinLocale(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, lang]) => window.localStorage.setItem(key, lang),
    [LANG_STORAGE_KEY, TEST_LOCALE] as const,
  );
}

type WorkerFixtures = {
  /** A pg client for resetting the shared DB between tests. */
  dbClient: Client;
};

type TestFixtures = {
  /** Open an independent browser context (empty IndexedDB) — used to prove data
   *  round-tripped through the server, not just local Dexie. Auto-closed. */
  openFresh: () => Promise<Page>;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  dbClient: [
    async ({}, use) => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await use(client);
      await client.end();
    },
    { scope: "worker" },
  ],

  // Auto: truncate before each test. Cascades from `users` to every content table
  // (mirrors backend/src/test/db.ts). The dev user is re-provisioned JIT on the
  // next /api/me. Runs before the test body navigates.
  page: async ({ page, dbClient }, use) => {
    await dbClient.query("TRUNCATE users RESTART IDENTITY CASCADE");
    await pinLocale(page);
    await use(page);
  },

  openFresh: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await pinLocale(page);
      return page;
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };

/**
 * Resolve when the next push to the server succeeds — the signal that a local
 * mutation has reached Postgres. Call after the action that dirties a row; the
 * 600ms sync debounce means the request fires after this starts waiting.
 */
export async function waitForPush(page: Page): Promise<void> {
  await page.waitForResponse(
    (r) => r.url().includes("/api/sync/push") && r.request().method() === "POST" && r.ok(),
  );
}

/** Resolve when a pull completes — useful as an explicit sync point after load. */
export async function waitForPull(page: Page): Promise<void> {
  await page.waitForResponse((r) => r.url().includes("/api/sync/pull") && r.ok());
}

/** Open the context-aware capture sheet and save an idea (dismiss saves, §11.1). */
export async function captureIdea(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: "Capture an idea" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByPlaceholder("Type an idea…").fill(text);
  // Dismiss saves; Escape is the keyboard equivalent of tapping the backdrop.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}
