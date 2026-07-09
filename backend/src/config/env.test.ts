import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("loadEnv", () => {
  it("defaults authMode to dev outside production", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.authMode).toBe("dev");
  });

  it("defaults authMode to sidecar in production", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production" });
    expect(env.authMode).toBe("sidecar");
  });

  it("honors an explicit AUTH_MODE override", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production", AUTH_MODE: "dev" });
    expect(env.authMode).toBe("dev");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
  });

  it("leaves AUTH_INTERNAL_URL unset unless configured (callers fall back to AUTH_SERVICE_URL)", () => {
    expect(loadEnv({ ...base }).AUTH_INTERNAL_URL).toBeUndefined();
    const env = loadEnv({
      ...base,
      AUTH_INTERNAL_URL: "http://homectl-auth.homectl.svc.cluster.local",
    });
    expect(env.AUTH_INTERNAL_URL).toBe(
      "http://homectl-auth.homectl.svc.cluster.local",
    );
  });
});
