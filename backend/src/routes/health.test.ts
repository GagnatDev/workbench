import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../app.js";
import { createIdentityMiddleware } from "../auth/identity.js";
import { env } from "../config/env.js";
import type { Db } from "../db/kysely.js";

// buildApp needs deps but /health never touches them.
const app = buildApp({ db: {} as Db, identity: createIdentityMiddleware(env) });

describe("GET /health", () => {
  it("returns a 200 liveness response", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
