import { createAuthClient } from "@gagnatdev/homectl-auth-client/server";
import type { Env } from "../config/env.js";
import type { AuthProvider } from "./types.js";

export async function createHomectlProvider(env: Env): Promise<AuthProvider> {
  const { authMiddleware, callbackHandler, logoutHandler } = createAuthClient({
    authServiceUrl: env.AUTH_SERVICE_URL,
    // Token exchange + JWKS go over cluster service discovery; the public URL
    // stays the JWT issuer and the browser-facing /authorize + logout target.
    internalAuthServiceUrl: env.AUTH_INTERNAL_URL,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.WORKBENCH_CLIENT_SECRET!,
    appBaseUrl: env.APP_BASE_URL,
    callbackPath: env.AUTH_CALLBACK_PATH,
  });

  return { authMiddleware, callbackHandler, logoutHandler };
}
