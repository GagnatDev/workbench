import { test, expect, waitForPush } from "../src/fixtures";

/**
 * Photo attachment, end-to-end through object storage: capture an idea with a
 * photo → the sync engine presigns and PUTs the bytes directly to MinIO → the
 * attachment row (with its storage key) is pushed to Postgres. A fresh browser
 * context (no local blob) then renders the image via the backend's presigned GET,
 * proving the object is actually in the bucket.
 */

// A minimal valid 1×1 PNG — avoids committing a binary fixture.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

test("uploads a captured photo to the bucket and serves it back", async ({ page, openFresh }) => {
  await page.goto("/inbox");

  // Open capture, attach the photo to the hidden file input, add some text.
  await page.getByRole("button", { name: "Capture an idea" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByPlaceholder("Type an idea…").fill("Workshop photo");
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });
  await expect(sheet.getByRole("img", { name: "Attached" })).toBeVisible();

  // The presign request carries the attachment id; grab it as the sheet saves+syncs.
  const presignRequest = page.waitForRequest((req) =>
    req.url().includes("/api/uploads/presign"),
  );
  await page.keyboard.press("Escape"); // dismiss saves
  await expect(sheet).toBeHidden();

  const attachmentId = JSON.parse((await presignRequest).postData() ?? "{}").attachmentId as string;
  expect(attachmentId).toBeTruthy();

  // After the push, Postgres holds the attachment row with its storage key.
  await waitForPush(page);

  // Fresh context: no local blob, so the thumbnail resolves via /api/files/:id,
  // which 302-redirects to a presigned GET against the bucket.
  const fresh = await openFresh();
  await fresh.goto("/inbox");
  await expect(fresh.getByText("Workshop photo")).toBeVisible();

  const fileResponse = await fresh.request.get(`/api/files/${attachmentId}`);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toContain("image");
});
