import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { sql } from "kysely";
import { buildTestApp } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";
import { UserRepository } from "../storage/userRepository.js";

/** Provision a user via /api/me and seed one row in every content table for them. */
async function seedUser(app: ReturnType<typeof buildTestApp>, sub: string) {
  const me = await request(app).get("/api/me").set("x-dev-sub", sub);
  const userId = me.body.id as string;
  const db = testDb();
  await db
    .insertInto("collections")
    .values({ id: randomUUID(), user_id: userId, name: "C", rank: "a" })
    .execute();
  await db
    .insertInto("projects")
    .values({
      id: randomUUID(),
      user_id: userId,
      title: "P",
      rank: "a",
      stages: "[]",
      details: "{}",
      tags: "[]",
    })
    .execute();
  await db
    .insertInto("sections")
    .values({
      id: randomUUID(),
      user_id: userId,
      project_id: randomUUID(),
      kind: "journal",
      name: "S",
      rank: "a",
    })
    .execute();
  await db
    .insertInto("items")
    .values({
      id: randomUUID(),
      user_id: userId,
      section_id: randomUUID(),
      rank: "a",
      payload: "{}",
      tags: "[]",
    })
    .execute();
  await db
    .insertInto("ideas")
    .values({
      id: randomUUID(),
      user_id: userId,
      content: "idea",
      state: "captured",
      tags: "[]",
    })
    .execute();
  await db
    .insertInto("attachments")
    .values({
      id: randomUUID(),
      user_id: userId,
      owner_type: "idea",
      owner_id: randomUUID(),
    })
    .execute();
  return userId;
}

const CONTENT_TABLES = [
  "collections",
  "projects",
  "sections",
  "items",
  "ideas",
  "attachments",
] as const;

async function rowCount(userId: string): Promise<number> {
  const db = testDb();
  let total = 0;
  for (const table of CONTENT_TABLES) {
    const { rows } = await sql<{ n: string }>`
      SELECT count(*) AS n FROM ${sql.ref(table)} WHERE user_id = ${userId}
    `.execute(db);
    total += Number(rows[0]!.n);
  }
  return total;
}

describe("DELETE /api/account", () => {
  useCleanDb();
  const app = buildTestApp();

  it("deletes the user and cascades to all content tables", async () => {
    const userId = await seedUser(app, "owner");
    expect(await rowCount(userId)).toBe(6);

    const res = await request(app).delete("/api/account").set("x-dev-sub", "owner");

    expect(res.status).toBe(204);
    const users = new UserRepository(testDb());
    expect(await users.findById(userId)).toBeUndefined();
    expect(await rowCount(userId)).toBe(0);
  });

  it("leaves another user's data untouched", async () => {
    const mine = await seedUser(app, "me");
    const theirs = await seedUser(app, "them");

    await request(app).delete("/api/account").set("x-dev-sub", "me").expect(204);

    expect(await rowCount(mine)).toBe(0);
    expect(await rowCount(theirs)).toBe(6);
    const users = new UserRepository(testDb());
    expect(await users.findById(theirs)).toBeDefined();
  });

  it("still deletes when object storage is unreachable (S3 cleanup is best-effort)", async () => {
    // The test env configures S3 (env vars) but runs no MinIO, so deleteUserObjects
    // throws ECONNREFUSED. That must not strand the account: the row delete (and its
    // content cascade) proceeds anyway, with the S3 failure logged for a later sweep.
    const userId = await seedUser(app, "s3-down");
    await request(app).delete("/api/account").set("x-dev-sub", "s3-down").expect(204);
    expect(await rowCount(userId)).toBe(0);
  });
});
