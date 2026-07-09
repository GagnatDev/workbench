import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";
import { UserRepository } from "../storage/userRepository.js";
import { DEV_PRINCIPAL } from "../auth/devProvider.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("GET /api/me", () => {
  useCleanDb();
  const app = buildTestApp();

  it("provisions the dev user just-in-time and returns the app identity", async () => {
    const res = await request(app).get("/api/me");

    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(UUID_RE);
    // The returned id is the app's own uuid, NOT the auth sub.
    expect(res.body.id).not.toBe(DEV_PRINCIPAL.id);
    expect(res.body).toMatchObject({
      email: DEV_PRINCIPAL.email,
      role: DEV_PRINCIPAL.role,
    });

    const users = new UserRepository(testDb());
    expect(await users.count()).toBe(1);
  });

  it("reuses the same user row on subsequent requests (no duplicate)", async () => {
    await request(app).get("/api/me");
    await request(app).get("/api/me");

    const users = new UserRepository(testDb());
    expect(await users.count()).toBe(1);
  });

  it("provisions a distinct user per auth subject", async () => {
    const a = await request(app).get("/api/me").set("x-dev-sub", "friend-a");
    const b = await request(app).get("/api/me").set("x-dev-sub", "friend-b");

    expect(a.body.id).not.toBe(b.body.id);
    const users = new UserRepository(testDb());
    expect(await users.count()).toBe(2);
  });
});
