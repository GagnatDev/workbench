import { createAuthClient } from "@gagnatdev/homectl-auth-client/server";
import type { Env } from "../config/env.js";
import type { AuthProvider } from "./types.js";

export async function createHomectlProvider(env: Env): Promise<AuthProvider> {
  const { authMiddleware, callbackHandler, logoutHandler } = createAuthClient({
    authServiceUrl: env.AUTH_SERVICE_URL,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.WORKBENCH_CLIENT_SECRET!,
    appBaseUrl: env.APP_BASE_URL,
    callbackPath: env.AUTH_CALLBACK_PATH,
  });

  return { authMiddleware, callbackHandler, logoutHandler };
}
