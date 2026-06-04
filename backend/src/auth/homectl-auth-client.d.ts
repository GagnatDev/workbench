/**
 * Minimal ambient declaration for the private `@gagnatdev/homectl-auth-client`
 * server entry. The package is installed only when AUTH_MODE=homectl (see
 * .npmrc.example) and is dynamically imported in homectlProvider.ts, so this
 * shim lets the codebase type-check and build without it present.
 *
 * Keep in sync with the real package's exports. Verified against the client at
 * homectl-auth/packages/client/src/server.ts.
 */
declare module "@gagnatdev/homectl-auth-client/server" {
  import type { RequestHandler } from "express";

  export interface AuthClientOptions {
    authServiceUrl: string;
    clientId: string;
    clientSecret: string;
    appBaseUrl: string;
    callbackPath?: string;
    jwksUrl?: string;
  }

  export interface AuthClientResult {
    authMiddleware: RequestHandler;
    callbackHandler: RequestHandler;
    logoutHandler: RequestHandler;
  }

  export function createAuthClient(opts: AuthClientOptions): AuthClientResult;
}
