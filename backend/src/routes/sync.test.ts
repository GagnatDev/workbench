import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildTestApp } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

/** A minimal valid `collections` row (name + rank are NOT NULL). */
function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: "Mugs",
    rank: "a0",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function pull(agent: Express, since = "0", devSub?: string) {
  const req = request(agent).get("/api/sync/pull").query({ since });
  return devSub ? req.set("x-dev-sub", devSub) : req;
}

function push(agent: Express, changes: Record<string, unknown[]>, devSub?: string) {
  const req = request(agent).post("/api/sync/push").send({ changes });
  return devSub ? req.set("x-dev-sub", devSub) : req;
}

describe("sync round-trip", () => {
  it("pushes a row and pulls it back", async () => {
    const row = collection();
    const pushed = await push(app, { collections: [row] });
    expect(pushed.status).toBe(200);
    expect(pushed.body.applied.collections).toHaveLength(1);

    const pulled = await pull(app);
    expect(pulled.status).toBe(200);
    expect(pulled.body.changes.collections).toHaveLength(1);
    expect(pulled.body.changes.collections[0]).toMatchObject({
      id: row.id,
      name: "Mugs",
      rank: "a0",
      deleted: false,
    });
  });

  it("advances the cursor: pull since=serverTime returns nothing new", async () => {
    await push(app, { collections: [collection()] });
    const first = await pull(app);
    const since = first.body.serverTime;

    const second = await pull(app, since);
    expect(second.body.changes.collections).toHaveLength(0);
  });

  it("server-stamps updated_at (not the client's value)", async () => {
    const clientTime = "2000-01-01T00:00:00.000Z";
    const row = collection({ updated_at: clientTime });
    await push(app, { collections: [row] });

    const pulled = await pull(app);
    const stored = pulled.body.changes.collections[0].updated_at as string;
    expect(stored).not.toBe(clientTime);
    expect(Date.parse(stored)).toBeGreaterThan(Date.parse(clientTime));
  });
});

/**
 * A minimal valid `projects` row. The upsert sets every data column explicitly
 * (DB defaults don't apply), so the NOT NULL columns — title, stages, details,
 * favourite, rank — must all be present.
 */
function project(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    title: "Raku test",
    stages: [],
    details: {},
    favourite: false,
    rank: "a0",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("project tags (Phase 6)", () => {
  it("round-trips the tags jsonb array", async () => {
    const row = project({ tags: ["raku", "blue"] });
    const pushed = await push(app, { projects: [row] });
    expect(pushed.status).toBe(200);
    expect(pushed.body.applied.projects[0].tags).toEqual(["raku", "blue"]);

    const pulled = await pull(app);
    expect(pulled.body.changes.projects[0].tags).toEqual(["raku", "blue"]);
  });

  it("defaults to an empty array when the client omits tags", async () => {
    await push(app, { projects: [project()] });
    const pulled = await pull(app);
    // A row pushed without `tags` stores SQL JSON null, surfaced as null/[] —
    // never undefined, so the client's `?? []` always has something to read.
    expect(pulled.body.changes.projects[0].tags ?? []).toEqual([]);
  });
});

describe("last-write-wins", () => {
  it("rejects a write older than the stored row, accepts a newer one", async () => {
    const id = randomUUID();
    const base = new Date();
    const newer = new Date(base.getTime() + 60_000).toISOString();
    const older = new Date(base.getTime() - 60_000).toISOString();

    await push(app, { collections: [collection({ id, name: "current", updated_at: newer })] });

    // Older edit must NOT overwrite.
    await push(app, { collections: [collection({ id, name: "stale", updated_at: older })] });
    let pulled = await pull(app);
    expect(pulled.body.changes.collections[0].name).toBe("current");

    // A newer edit wins.
    const newest = new Date(base.getTime() + 120_000).toISOString();
    await push(app, { collections: [collection({ id, name: "fresh", updated_at: newest })] });
    pulled = await pull(app);
    expect(pulled.body.changes.collections[0].name).toBe("fresh");
  });
});

describe("tombstones", () => {
  it("propagates deletions via the deleted flag", async () => {
    const id = randomUUID();
    await push(app, { collections: [collection({ id })] });
    await push(app, {
      collections: [collection({ id, deleted: true, updated_at: new Date().toISOString() })],
    });

    const pulled = await pull(app);
    expect(pulled.body.changes.collections[0]).toMatchObject({ id, deleted: true });
  });
});

describe("user isolation & ownership", () => {
  it("never returns another user's rows", async () => {
    await push(app, { collections: [collection({ name: "mine" })] }, "user-a");
    const other = await pull(app, "0", "user-b");
    expect(other.body.changes.collections).toHaveLength(0);
  });

  it("forces user_id from the token, ignoring a client-supplied one", async () => {
    // Provision user-b so we have a real foreign user id to try to impersonate.
    await push(app, { collections: [collection()] }, "user-b");
    const me = await request(app).get("/api/me").set("x-dev-sub", "user-b");
    const victimId = me.body.id as string;

    const row = collection({ name: "smuggled", user_id: victimId });
    await push(app, { collections: [row] }, "user-a");

    // The row belongs to user-a (the token), not the smuggled id.
    const asA = await pull(app, "0", "user-a");
    expect(asA.body.changes.collections.map((r: { name: string }) => r.name)).toContain(
      "smuggled",
    );
    const asB = await pull(app, "0", "user-b");
    expect(asB.body.changes.collections.map((r: { name: string }) => r.name)).not.toContain(
      "smuggled",
    );
  });
});

describe("validation", () => {
  it("rejects a row without a valid uuid id", async () => {
    const res = await push(app, { collections: [collection({ id: "not-a-uuid" })] });
    expect(res.status).toBe(400);
  });

  it("ignores unknown tables without failing the push", async () => {
    const res = await push(app, { bogus: [{ id: randomUUID(), updated_at: new Date().toISOString() }] });
    expect(res.status).toBe(200);
  });
});
