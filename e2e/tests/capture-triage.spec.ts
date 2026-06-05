import { test, expect, captureIdea, waitForPush } from "../src/fixtures";

/**
 * Global inbox: capture an idea and triage it (keep / archive). Each test proves
 * the change reached the server by re-opening the app in a fresh browser context
 * (empty IndexedDB) and confirming the idea is pulled back.
 */
test.describe("Inbox capture & triage", () => {
  test("captures an idea and persists it to the server", async ({ page, openFresh }) => {
    await page.goto("/inbox");
    await captureIdea(page, "Sketch a logo");

    await expect(page.getByText("Sketch a logo")).toBeVisible();
    await waitForPush(page);

    const fresh = await openFresh();
    await fresh.goto("/inbox");
    await expect(fresh.getByText("Sketch a logo")).toBeVisible();
  });

  test("keeps an idea so it moves to the Kept segment", async ({ page, openFresh }) => {
    await page.goto("/inbox");
    await captureIdea(page, "Keep this one");

    await page.getByText("Keep this one").click(); // tap card → detail sheet
    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "Keep" }).click();
    await expect(detail).toBeHidden();

    // Left the New segment; shows under Kept.
    await expect(page.getByText("Keep this one")).toBeHidden();
    await page.getByRole("button", { name: "Kept" }).click();
    await expect(page.getByText("Keep this one")).toBeVisible();
    await waitForPush(page);

    const fresh = await openFresh();
    await fresh.goto("/inbox");
    await fresh.getByRole("button", { name: "Kept" }).click();
    await expect(fresh.getByText("Keep this one")).toBeVisible();
  });

  test("archives an idea so it leaves the inbox", async ({ page, openFresh }) => {
    await page.goto("/inbox");
    await captureIdea(page, "Archive this one");

    await page.getByText("Archive this one").click();
    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "Archive" }).click();
    await expect(detail).toBeHidden();
    await expect(page.getByText("Archive this one")).toBeHidden();
    await waitForPush(page);

    // Fresh context: the archived idea is reachable via the archived view.
    const fresh = await openFresh();
    await fresh.goto("/inbox");
    await fresh.getByRole("button", { name: "More" }).click();
    await fresh.getByRole("link", { name: "View archived" }).click();
    await expect(fresh.getByText("Archive this one")).toBeVisible();
  });
});
