import { afterEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { authGatewayRoutes } from "./authGateway.js";
import { loadEnv, type Env } from "../config/env.js";

const homectlEnv: Env = loadEnv({
  DATABASE_URL: "postgres://unused",
  AUTH_MODE: "homectl",
  WORKBENCH_CLIENT_SECRET: "secret",
  AUTH_SERVICE_URL: "https://auth.test",
  AUTH_INTERNAL_URL: "http://auth.internal",
  AUTH_CLIENT_ID: "workbench",
  APP_BASE_URL: "https://app.test",
});
const devEnv: Env = loadEnv({ DATABASE_URL: "postgres://unused", AUTH_MODE: "dev" });

function appWith(config: Env): Express {
  const app = express();
  app.use(cookieParser());
  app.use(authGatewayRoutes(config));
  return app;
}

/** Extract the `state` query param from a login redirect's Location header. */
function stateFrom(location: string): string {
  return new URL(location).searchParams.get("state")!;
}

/** Extract the state cookie pair (`name=value`) from a login response. */
function stateCookieFrom(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith("workbench_auth_state="));
  expect(cookie).toBeDefined();
  return cookie!.split(";")[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth gateway (dev mode)", () => {
  it("mounts no routes, so paths fall through (to the SPA fallback in the real app)", async () => {
    const res = await request(appWith(devEnv)).post("/auth/refresh");
    expect(res.status).toBe(404);
  });
});

describe("GET /auth/login", () => {
  it("redirects to the public /authorize with the client's params and a state cookie", async () => {
    const res = await request(appWith(homectlEnv)).get("/auth/login");

    expect(res.status).toBe(302);
    const location = new URL(res.headers["location"]!);
    expect(location.origin).toBe("https://auth.test");
    expect(location.pathname).toBe("/authorize");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe("workbench");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://app.test/auth/callback",
    );
    expect(location.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(stateCookieFrom(res)).toContain("workbench_auth_state=");
  });
});

describe("GET /auth/callback", () => {
  it("exchanges the code in-cluster and redirects into the app", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ access_token: "ignored" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = appWith(homectlEnv);

    const login = await request(app).get("/auth/login?return_to=%2Fprojects%2F42");
    const res = await request(app)
      .get(`/auth/callback?code=the-code&state=${stateFrom(login.headers["location"]!)}`)
      .set("Cookie", stateCookieFrom(login));

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/projects/42");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://auth.internal/token",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      grant_type: string;
      code: string;
      client_secret: string;
      redirect_uri: string;
    };
    expect(body.grant_type).toBe("authorization_code");
    expect(body.code).toBe("the-code");
    expect(body.client_secret).toBe("secret");
    expect(body.redirect_uri).toBe("https://app.test/auth/callback");
  });

  it("normalizes a cross-origin return_to to /", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const app = appWith(homectlEnv);

    for (const evil of ["https://evil.test/x", "//evil.test/x"]) {
      const login = await request(app).get(
        `/auth/login?return_to=${encodeURIComponent(evil)}`,
      );
      const res = await request(app)
        .get(`/auth/callback?code=c&state=${stateFrom(login.headers["location"]!)}`)
        .set("Cookie", stateCookieFrom(login));
      expect(res.headers["location"]).toBe("/");
    }
  });

  it("bounces to /login without a state cookie, and never calls the auth service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(appWith(homectlEnv)).get("/auth/callback?code=c&state=s");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounces to /login on a state mismatch or tampered cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = appWith(homectlEnv);
    const login = await request(app).get("/auth/login");
    const cookie = stateCookieFrom(login);

    const mismatch = await request(app)
      .get("/auth/callback?code=c&state=not-the-nonce")
      .set("Cookie", cookie);
    expect(mismatch.headers["location"]).toBe("/login");

    const tampered = await request(app)
      .get(`/auth/callback?code=c&state=${stateFrom(login.headers["location"]!)}`)
      .set("Cookie", `${cookie}x`);
    expect(tampered.headers["location"]).toBe("/login");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounces to /login when the token exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 400 })),
    );
    const app = appWith(homectlEnv);
    const login = await request(app).get("/auth/login");

    const res = await request(app)
      .get(`/auth/callback?code=bad&state=${stateFrom(login.headers["location"]!)}`)
      .set("Cookie", stateCookieFrom(login));

    expect(res.headers["location"]).toBe("/login");
  });
});

describe("POST /auth/refresh and /auth/logout", () => {
  it("forwards the browser's cookies in-cluster and relays the rotated Set-Cookie", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: "tok" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "homectl_refresh=rotated; Domain=.homectl.no; HttpOnly",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(appWith(homectlEnv))
      .post("/auth/refresh")
      .set("Cookie", "homectl_refresh=old");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://auth.internal/refresh",
      expect.objectContaining({
        method: "POST",
        headers: { cookie: "homectl_refresh=old" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: "tok" });
    expect(res.headers["set-cookie"]).toEqual([
      "homectl_refresh=rotated; Domain=.homectl.no; HttpOnly",
    ]);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("relays an upstream 401 (dead or missing session) as-is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_session" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const res = await request(appWith(homectlEnv)).post("/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_session" });
  });

  it("maps an unreachable auth service to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await request(appWith(homectlEnv)).post("/auth/refresh");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "auth_service_unreachable" });
  });

  it("proxies logout to the internal /logout", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(appWith(homectlEnv))
      .post("/auth/logout")
      .set("Cookie", "homectl_refresh=old");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://auth.internal/logout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(res.status).toBe(204);
  });
});
