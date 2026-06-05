import { startStack } from "./src/stack";

/**
 * Bring the full stack up once before the suite. Returning the teardown closure
 * (rather than a separate globalTeardown file) keeps the container/process handles
 * captured in scope — no shared module state to coordinate.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  return await startStack();
}
