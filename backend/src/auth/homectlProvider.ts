import { createAuthClient } from "@gagnatdev/homectl-auth-client/server";
import type { Env } from "../config/env.js";
import type { AuthProvider } from "./types.js";

export async function createHomectlProvider(env: Env): Promise<AuthProvider> {
  // Only the JWT verification middleware comes from the package. The package's
  // callback/logout handlers are unused: they assume the browser talks to the
  // auth service's public origin, whereas routes/authGateway.ts keeps those
  // flows same-origin and in-cluster.
  const { authMiddleware } = createAuthClient({
    authServiceUrl: env.AUTH_SERVICE_URL,
    // JWKS goes over cluster service discovery; the public URL stays the JWT
    // issuer and the browser-facing /authorize target.
    internalAuthServiceUrl: env.AUTH_INTERNAL_URL,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.WORKBENCH_CLIENT_SECRET!,
    appBaseUrl: env.APP_BASE_URL,
    callbackPath: env.AUTH_CALLBACK_PATH,
  });

  return { authMiddleware };
}
