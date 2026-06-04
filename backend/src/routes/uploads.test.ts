import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildTestApp } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

/** Push an attachment row over sync so the files route has something to resolve. */
function pushAttachment(
  agent: Express,
  overrides: Record<string, unknown> = {},
  devSub?: string,
) {
  const row = {
    id: randomUUID(),
    owner_type: "idea",
    owner_id: randomUUID(),
    storage_key: `someone/${randomUUID()}`,
    content_type: "image/jpeg",
    uploaded: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  const req = request(agent)
    .post("/api/sync/push")
    .send({ changes: { attachments: [row] } });
  return { row, send: devSub ? req.set("x-dev-sub", devSub) : req };
}

describe("POST /api/uploads/presign", () => {
  it("returns a presigned PUT URL keyed by the user", async () => {
    const attachmentId = randomUUID();
    const res = await request(app)
      .post("/api/uploads/presign")
      .send({ attachmentId, contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    // Key is `<userId>/<attachmentId>` — the user prefix is server-derived.
    expect(res.body.storageKey).toMatch(new RegExp(`/${attachmentId}$`));
    expect(res.body.url).toContain(attachmentId);
    expect(res.body.url).toContain("X-Amz-Signature");
  });

  it("scopes the key to the authenticated user (different users, different prefix)", async () => {
    const attachmentId = randomUUID();
    const a = await request(app)
      .post("/api/uploads/presign")
      .send({ attachmentId, contentType: "image/png" });
    const b = await request(app)
      .post("/api/uploads/presign")
      .set("x-dev-sub", "friend|2222")
      .send({ attachmentId, contentType: "image/png" });

    expect(a.body.storageKey).not.toBe(b.body.storageKey);
    expect(a.body.storageKey.endsWith(attachmentId)).toBe(true);
    expect(b.body.storageKey.endsWith(attachmentId)).toBe(true);
  });

  it("rejects a malformed request", async () => {
    const res = await request(app)
      .post("/api/uploads/presign")
      .send({ attachmentId: "not-a-uuid", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/files/:attachmentId", () => {
  it("redirects to a presigned GET for the owner's attachment", async () => {
    const { row, send } = pushAttachment(app);
    await send;

    const res = await request(app).get(`/api/files/${row.id}`).redirects(0);
    expect(res.status).toBe(302);
    // Path-style URL keeps the key's slashes, so it appears verbatim in the path.
    expect(res.headers.location).toContain(row.storage_key);
    expect(res.headers.location).toContain("X-Amz-Signature");
  });

  it("404s another user's attachment (no cross-user reads)", async () => {
    const { row, send } = pushAttachment(app);
    await send;

    const res = await request(app)
      .get(`/api/files/${row.id}`)
      .set("x-dev-sub", "friend|3333")
      .redirects(0);
    expect(res.status).toBe(404);
  });

  it("404s an unknown id", async () => {
    const res = await request(app).get(`/api/files/${randomUUID()}`).redirects(0);
    expect(res.status).toBe(404);
  });

  it("404s a malformed id (no DB cast error)", async () => {
    const res = await request(app).get("/api/files/not-a-uuid").redirects(0);
    expect(res.status).toBe(404);
  });
});
