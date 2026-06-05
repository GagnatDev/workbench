import { afterEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { inviteRoutes } from "./invites.js";
import { errorHandler } from "../middleware/error.js";
import { loadEnv, type Env } from "../config/env.js";

const homectlEnv: Env = loadEnv({
  DATABASE_URL: "postgres://unused",
  AUTH_MODE: "homectl",
  WORKBENCH_CLIENT_SECRET: "secret",
  AUTH_SERVICE_URL: "https://auth.test",
  AUTH_CLIENT_ID: "workbench",
});
const devEnv: Env = loadEnv({ DATABASE_URL: "postgres://unused", AUTH_MODE: "dev" });

/** A bare app mounting only the invites router — no DB, no auth middleware. */
function appWith(config: Env): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", inviteRoutes(config));
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/invites", () => {
  it("is unavailable in dev mode (no auth service to call)", async () => {
    const res = await request(appWith(devEnv))
      .post("/api/invites")
      .set("Authorization", "Bearer t")
      .send({ email: "friend@example.com" });
    expect(res.status).toBe(501);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await request(appWith(homectlEnv))
      .post("/api/invites")
      .send({ email: "friend@example.com" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing or invalid email", async () => {
    const res = await request(appWith(homectlEnv))
      .post("/api/invites")
      .set("Authorization", "Bearer t")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("forwards the bearer + app scope to the auth service and returns its invite", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ inviteUrl: "https://auth.test/i/abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(appWith(homectlEnv))
      .post("/api/invites")
      .set("Authorization", "Bearer token-123")
      .send({ email: "friend@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inviteUrl: "https://auth.test/i/abc" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://auth.test/api/invites");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "friend@example.com",
      appId: "workbench",
      role: "member",
    });
  });

  it("passes a client error from the auth service straight through", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: "Only admins may invite" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await request(appWith(homectlEnv))
      .post("/api/invites")
      .set("Authorization", "Bearer t")
      .send({ email: "friend@example.com" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only admins may invite");
  });

  it("reports a 502 when the auth service is unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const res = await request(appWith(homectlEnv))
      .post("/api/invites")
      .set("Authorization", "Bearer t")
      .send({ email: "friend@example.com" });
    expect(res.status).toBe(502);
  });
});
