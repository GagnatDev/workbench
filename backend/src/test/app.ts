import { buildApp } from "../app.js";
import { createDevProvider } from "../auth/devProvider.js";
import { testDb } from "./db.js";

/** Build the Express app (dev auth provider) wired to the shared test database. */
export function buildTestApp(): ReturnType<typeof buildApp> {
  return buildApp({ db: testDb(), authProvider: createDevProvider() });
}
