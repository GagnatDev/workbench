import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("loadEnv", () => {
  it("defaults authMode to dev outside production", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.authMode).toBe("dev");
  });

  it("defaults authMode to homectl in production (requires the client secret)", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(
      /WORKBENCH_CLIENT_SECRET/,
    );
    const env = loadEnv({
      ...base,
      NODE_ENV: "production",
      WORKBENCH_CLIENT_SECRET: "secret",
    });
    expect(env.authMode).toBe("homectl");
  });

  it("honors an explicit AUTH_MODE override (dev in production needs no secret)", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production", AUTH_MODE: "dev" });
    expect(env.authMode).toBe("dev");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
  });
});
