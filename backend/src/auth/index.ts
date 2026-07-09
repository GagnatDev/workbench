import { env, type Env } from "../config/env.js";
import { createDevProvider } from "./devProvider.js";
import { createHomectlProvider } from "./homectlProvider.js";
import type { AuthProvider } from "./types.js";

/**
 * Select the auth provider from config. `dev` is synchronous and dependency-free;
 * `homectl` lazily loads the private client package.
 */
export async function createAuthProvider(
  config: Env = env,
): Promise<AuthProvider> {
  if (config.authMode === "homectl") {
    return createHomectlProvider(config);
  }
  return createDevProvider();
}

export type { AuthProvider, AuthUser, AppUser } from "./types.js";
