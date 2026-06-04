import type {
  AuthClientOptions,
  AuthClientResult,
} from "@gagnatdev/homectl-auth-client/server";
import type { Env } from "../config/env.js";
import type { AuthProvider } from "./types.js";

// Type-only import above (erased at build). The runtime import uses a non-literal
// specifier so esbuild/tsup won't try to resolve or bundle it — node resolves it
// at runtime, only on the AUTH_MODE=homectl path.
const CLIENT_SPECIFIER = "@gagnatdev/homectl-auth-client/server";

type HomectlServerModule = {
  createAuthClient: (opts: AuthClientOptions) => AuthClientResult;
};

/**
 * Real auth provider backed by homectl-auth (OAuth2 code flow + RS256 JWT).
 *
 * The client library is a private GitHub Packages dependency installed only for
 * real-auth builds (see .npmrc.example). It is imported dynamically so the
 * default (dev) build doesn't depend on it being present.
 *
 * NOTE: `@gagnatdev/homectl-auth-client` is not yet proven in production
 * (travel-journal is mid-migration onto it). Validate the full
 * login -> callback -> token -> refresh flow against the real auth.homectl.no
 * and be ready to patch the client when enabling this path.
 */
export async function createHomectlProvider(env: Env): Promise<AuthProvider> {
  const mod: HomectlServerModule = await import(CLIENT_SPECIFIER);

  const { authMiddleware, callbackHandler, logoutHandler } = mod.createAuthClient({
    authServiceUrl: env.AUTH_SERVICE_URL,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.WORKBENCH_CLIENT_SECRET!,
    appBaseUrl: env.APP_BASE_URL,
    callbackPath: env.AUTH_CALLBACK_PATH,
  });

  // The library sets req.user = { id (sub), email, isAdmin, role } — exactly our
  // AuthUser shape — so no adaptation is needed before resolveUser runs.
  return { authMiddleware, callbackHandler, logoutHandler };
}
