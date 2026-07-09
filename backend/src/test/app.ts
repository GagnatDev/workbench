import { buildApp } from "../app.js";
import { createIdentityMiddleware } from "../auth/identity.js";
import { loadEnv } from "../config/env.js";
import { testDb } from "./db.js";

/**
 * Build the Express app (dev identity middleware) wired to the shared test
 * database. `dev` mode synthesizes an identity when no `X-Homectl-*` headers are
 * present, so tests run with no auth-proxy in front.
 */
export function buildTestApp(): ReturnType<typeof buildApp> {
  const config = loadEnv({ DATABASE_URL: "postgres://unused", AUTH_MODE: "dev" });
  return buildApp({ db: testDb(), identity: createIdentityMiddleware(config) });
}
